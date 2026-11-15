// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title KuriCircle — one auction chit fund (kuri / chitty / bhishi / committee)
/// @notice N members each pay `contribution` every round for N rounds. Each round the pot goes to one member who
///         hasn't won yet: whoever bids the largest DISCOUNT (the share of the pot they'll give up). The winner takes
///         pot − discount; the organiser ("foreman") takes a fixed commission out of the discount; the rest of the
///         discount is shared equally among the members who paid that round as a DIVIDEND, which reduces what they
///         owe next round. In the last round the remaining member takes the pot at the minimum discount.
/// @dev    Teaching implementation for testnets — not a registered chit under the Chit Funds Act, 1982.
///         Design notes:
///         - Sealed bids by commit–reveal; a bond is lost if you commit and don't reveal. Ties go to the lowest seat.
///         - Two credit modes, chosen at creation and fixed:
///           ESCROW: the winner's own future instalments are held back from their prize — nobody can default on
///                   money they already received, but early winners get less cash up front.
///           TRUST:  the winner gets the whole prize, like a real chit. Every member posts one instalment as
///                   security; a missed instalment is paid from it once, and a second miss marks the member as in
///                   default (no bids, no dividends). The circle stays solvent; members bear the risk of a smaller pot.
///         - The foreman has no powers after the circle starts: no withdrawals, no parameter changes.
///         - Pull payments: money owed to anyone is credited to `claimable` and withdrawn by them.
///         - Solvency invariant: token balance == every liability tracked below (see `liabilities()`).
contract KuriCircle is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── configuration (fixed at creation) ───────────────────────────────────────
    struct Config {
        IERC20 token;
        address foreman;
        uint8 size; // number of members = number of rounds
        uint256 contribution; // instalment per member per round
        uint64 commitDuration; // seconds to pay and place a sealed bid
        uint64 revealDuration; // seconds to reveal bids
        uint16 maxDiscountBps; // highest discount a bid may offer, in basis points of the pot
        uint16 commissionBps; // foreman's commission, in basis points of the pot (also the minimum discount)
        bool escrowPrize; // ESCROW mode if true, TRUST mode if false
    }

    uint16 public constant MAX_DISCOUNT_CAP_BPS = 4000; // 40%: the ceiling a circle may choose (statute: 30%, 40% pending)
    uint16 public constant MAX_COMMISSION_BPS = 700; // 7%, the 2019 amendment's ceiling (5% before)
    uint8 public constant MIN_SIZE = 3;
    uint8 public constant MAX_SIZE = 40;

    enum Phase {
        Enrolling,
        Active,
        Finished,
        Cancelled
    }

    struct Member {
        uint8 seat; // 1-based seat number; 0 = not a member
        bool prized; // has already won a pot
        bool inDefault; // missed an instalment after security was used up
        uint8 misses; // instalments the member failed to pay themselves
        uint256 security; // TRUST-mode security still held (and the joining deposit in both modes)
        uint256 escrow; // ESCROW-mode prize held back for their own future instalments
        uint256 dividendCredit; // dividends, applied automatically to the next instalments
        uint256 claimable; // free to withdraw
    }

    Config public config;
    Phase public phase;
    uint8 public round; // 0-based current round
    uint64 public roundStart;
    address[] public seats;
    mapping(address => Member) public members;

    // per-round state
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => mapping(address => bytes32)) public commitment;
    mapping(uint256 => mapping(address => bool)) public revealed;
    uint256 public collected; // instalments received this round
    uint256 public bondsHeld; // reveal bonds held this round
    uint256 public forfeited; // bonds forfeited this round (become dividend)
    uint256 public dust; // indivisible dividend remainder carried to the next round
    uint16 public bestDiscountBps;
    uint8 public bestSeat; // 0 = no valid bid yet

    // ─── events ──────────────────────────────────────────────────────────────────
    event Joined(address indexed member, uint8 seat);
    event Started(uint64 at);
    event Cancelled();
    event Paid(uint8 indexed round, address indexed member, uint256 fromWallet, uint256 fromCredit);
    event AutoPaid(uint8 indexed round, address indexed member, uint256 fromEscrow, uint256 fromCredit, uint256 fromSecurity);
    event Defaulted(uint8 indexed round, address indexed member);
    event BidCommitted(uint8 indexed round, address indexed member);
    event BidRevealed(uint8 indexed round, address indexed member, uint16 discountBps);
    event Settled(
        uint8 indexed round,
        address indexed winner,
        uint16 discountBps,
        uint256 pot,
        uint256 prize,
        uint256 escrowed,
        uint256 commission,
        uint256 dividendEach,
        uint8 payers
    );
    event Withdrawn(address indexed member, uint256 amount);
    event Finished();

    // ─── errors ──────────────────────────────────────────────────────────────────
    error BadConfig(string why);
    error WrongPhase();
    error NotMember();
    error AlreadyMember();
    error CircleFull();
    error OnlyForeman();
    error WindowClosed();
    error WindowNotOver();
    error AlreadyPaid();
    error AlreadyCommitted();
    error NotEligible(string why);
    error BadReveal(string why);
    error NothingToWithdraw();
    error FeeOnTransferToken();

    /// @dev The implementation is never used directly; clones are initialised by the factory.
    constructor() {
        _disableInitializers();
    }

    function initialize(Config calldata c) external initializer {
        if (address(c.token) == address(0) || c.foreman == address(0)) revert BadConfig("zero address");
        if (c.size < MIN_SIZE || c.size > MAX_SIZE) revert BadConfig("size");
        if (c.contribution == 0 || c.contribution % 20 != 0) revert BadConfig("contribution must be a positive multiple of 20 units");
        if (c.commitDuration < 60 || c.revealDuration < 60) revert BadConfig("windows too short");
        if (c.maxDiscountBps > MAX_DISCOUNT_CAP_BPS) revert BadConfig("discount cap");
        if (c.commissionBps > MAX_COMMISSION_BPS || c.commissionBps > c.maxDiscountBps) revert BadConfig("commission");
        config = c;
    }

    // ─── views ───────────────────────────────────────────────────────────────────
    function pot() public view returns (uint256) {
        return config.contribution * config.size;
    }

    function bond() public view returns (uint256) {
        return config.contribution / 20;
    }

    function commitEnd() public view returns (uint64) {
        return roundStart + config.commitDuration;
    }

    function revealEnd() public view returns (uint64) {
        return commitEnd() + config.revealDuration;
    }

    function memberCount() external view returns (uint256) {
        return seats.length;
    }

    /// @notice What `member` owes for the current round after their dividend credit.
    function dueNow(address member) public view returns (uint256) {
        uint256 c = config.contribution;
        uint256 credit = members[member].dividendCredit;
        return credit >= c ? 0 : c - credit;
    }

    /// @notice The hash a member commits to. Binds chain, circle, round and bidder, so a commitment can't be replayed.
    function commitmentFor(address bidder, uint8 r, uint16 discountBps, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), r, bidder, discountBps, salt));
    }

    /// @notice Everything the circle owes to someone. Must always equal its token balance.
    function liabilities() public view returns (uint256 total) {
        total = collected + bondsHeld + forfeited + dust;
        for (uint256 i; i < seats.length; ++i) {
            Member storage m = members[seats[i]];
            total += m.security + m.escrow + m.dividendCredit + m.claimable;
        }
        if (config.foreman != address(0) && members[config.foreman].seat == 0) total += members[config.foreman].claimable;
    }

    // ─── enrolment ───────────────────────────────────────────────────────────────
    /// @notice Take a seat by posting one instalment as security. The circle starts when the last seat fills.
    function join() external nonReentrant {
        if (phase != Phase.Enrolling) revert WrongPhase();
        if (members[msg.sender].seat != 0) revert AlreadyMember();
        if (seats.length == config.size) revert CircleFull();
        seats.push(msg.sender);
        Member storage m = members[msg.sender];
        m.seat = uint8(seats.length);
        m.security = config.contribution;
        _pull(config.contribution);
        emit Joined(msg.sender, m.seat);
        if (seats.length == config.size) {
            phase = Phase.Active;
            roundStart = uint64(block.timestamp);
            emit Started(roundStart);
        }
    }

    /// @notice Before the circle fills, the foreman may call it off. Everyone's security becomes withdrawable.
    function cancel() external {
        if (msg.sender != config.foreman) revert OnlyForeman();
        if (phase != Phase.Enrolling) revert WrongPhase();
        phase = Phase.Cancelled;
        for (uint256 i; i < seats.length; ++i) {
            Member storage m = members[seats[i]];
            m.claimable += m.security;
            m.security = 0;
        }
        emit Cancelled();
    }

    // ─── each round ──────────────────────────────────────────────────────────────
    /// @notice Pay this round's instalment. Your dividend credit is used first; the rest comes from your wallet.
    function pay() external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase();
        Member storage m = members[msg.sender];
        if (m.seat == 0) revert NotMember();
        if (block.timestamp >= revealEnd()) revert WindowClosed();
        if (paid[round][msg.sender]) revert AlreadyPaid();
        uint256 c = config.contribution;
        uint256 fromCredit = m.dividendCredit >= c ? c : m.dividendCredit;
        m.dividendCredit -= fromCredit;
        uint256 fromWallet = c - fromCredit;
        paid[round][msg.sender] = true;
        collected += c;
        if (fromWallet > 0) _pull(fromWallet);
        emit Paid(round, msg.sender, fromWallet, fromCredit);
    }

    /// @notice Place a sealed bid: `hash = commitmentFor(you, round, discountBps, salt)`. Posts a bond of 5% of an
    ///         instalment, returned when you reveal. You must have paid this round and not have won before.
    function commit(bytes32 hash) external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase();
        if (block.timestamp >= commitEnd()) revert WindowClosed();
        if (round == config.size - 1) revert NotEligible("no auction in the last round");
        Member storage m = members[msg.sender];
        if (m.seat == 0) revert NotMember();
        if (m.prized) revert NotEligible("already won");
        if (m.inDefault) revert NotEligible("in default");
        if (!paid[round][msg.sender]) revert NotEligible("pay this round first");
        if (commitment[round][msg.sender] != bytes32(0)) revert AlreadyCommitted();
        commitment[round][msg.sender] = hash;
        uint256 b = bond();
        bondsHeld += b;
        _pull(b);
        emit BidCommitted(round, msg.sender);
    }

    /// @notice Reveal your sealed bid. The largest discount wins; on a tie, the lower seat number wins.
    function reveal(uint16 discountBps, bytes32 salt) external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase();
        if (block.timestamp < commitEnd()) revert BadReveal("bidding still open");
        if (block.timestamp >= revealEnd()) revert WindowClosed();
        bytes32 h = commitment[round][msg.sender];
        if (h == bytes32(0)) revert BadReveal("no bid");
        if (revealed[round][msg.sender]) revert BadReveal("already revealed");
        if (commitmentFor(msg.sender, round, discountBps, salt) != h) revert BadReveal("does not match commitment");
        revealed[round][msg.sender] = true;
        // The bond comes back either way; an out-of-range bid simply doesn't count.
        uint256 b = bond();
        bondsHeld -= b;
        members[msg.sender].claimable += b;
        emit BidRevealed(round, msg.sender, discountBps);
        if (discountBps < config.commissionBps || discountBps > config.maxDiscountBps) return;
        uint8 seat = members[msg.sender].seat;
        if (bestSeat == 0 || discountBps > bestDiscountBps || (discountBps == bestDiscountBps && seat < bestSeat)) {
            bestDiscountBps = discountBps;
            bestSeat = seat;
        }
    }

    /// @dev The result of one round, kept in memory (a struct keeps settle() under the EVM's 16-slot stack limit).
    struct Outcome {
        address winner;
        uint16 discountBps;
        uint256 pot;
        uint256 prize;
        uint256 escrowed;
        uint256 commission;
        uint256 dividendEach;
        uint8 payers;
    }

    /// @notice Close the round once reveals are over. Anyone may call it — no keeper, no admin.
    function settle() external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase();
        bool lastRound = round == config.size - 1;
        // The last round has no auction, so it can settle as soon as everyone has paid or the windows end.
        if (block.timestamp < revealEnd() && !(lastRound && _allPaid())) revert WindowNotOver();
        uint8 r = round;

        Outcome memory o;
        o.payers = _collectMissing(r); // 1. instalments nobody paid: escrow, then credit, then (once) security
        forfeited += bondsHeld; // 2. unrevealed bonds become dividend
        bondsHeld = 0;
        (o.winner, o.discountBps) = _pickWinner(r); // 3. highest valid bid, else the lowest eligible seat
        o.pot = collected;
        _split(r, o); // 4. prize, commission, dividends
        emit Settled(r, o.winner, o.discountBps, o.pot, o.prize, o.escrowed, o.commission, o.dividendEach, o.payers);

        bestSeat = 0;
        bestDiscountBps = 0;
        if (lastRound) _finish();
        else {
            round = r + 1;
            roundStart = uint64(block.timestamp);
        }
    }

    function _collectMissing(uint8 r) private returns (uint8 payers) {
        uint256 c = config.contribution;
        for (uint256 i; i < seats.length; ++i) {
            address who = seats[i];
            Member storage m = members[who];
            if (!paid[r][who] && !m.inDefault) _autoPay(r, who, m, c);
            if (paid[r][who]) payers++;
        }
    }

    function _pickWinner(uint8 r) private view returns (address winner, uint16 discountBps) {
        discountBps = config.commissionBps;
        if (bestSeat != 0) {
            address b = seats[bestSeat - 1];
            if (!members[b].inDefault && paid[r][b]) return (b, bestDiscountBps);
        }
        // No valid bid (or the last round): the lowest seat still eligible takes it at the minimum discount.
        for (uint256 i; i < seats.length; ++i) {
            Member storage m = members[seats[i]];
            if (!m.prized && !m.inDefault && paid[r][seats[i]]) return (seats[i], discountBps);
        }
        return (address(0), discountBps);
    }

    function _split(uint8 r, Outcome memory o) private {
        o.commission = (o.pot * config.commissionBps) / 10_000;
        uint256 pool = forfeited + dust;
        forfeited = 0;
        if (o.winner != address(0)) {
            uint256 discount = (o.pot * o.discountBps) / 10_000;
            o.prize = o.pot - discount;
            pool += discount - o.commission;
            Member storage w = members[o.winner];
            w.prized = true;
            if (config.escrowPrize) {
                uint256 owedLater = uint256(config.size - 1 - r) * config.contribution;
                o.escrowed = o.prize < owedLater ? o.prize : owedLater;
                w.escrow += o.escrowed;
            }
            w.claimable += o.prize - o.escrowed;
        } else {
            // Nobody left who may win: the pot (less commission) goes back to this round's payers.
            pool += o.pot - o.commission;
        }
        members[config.foreman].claimable += o.commission;
        collected = 0;

        o.dividendEach = o.payers == 0 ? 0 : pool / o.payers;
        dust = pool - o.dividendEach * o.payers;
        if (o.dividendEach > 0) {
            for (uint256 i; i < seats.length; ++i) {
                if (paid[r][seats[i]]) members[seats[i]].dividendCredit += o.dividendEach;
            }
        }
    }

    /// @notice Withdraw everything credited to you.
    function withdraw() external nonReentrant {
        Member storage m = members[msg.sender];
        uint256 amount = m.claimable;
        if (amount == 0) revert NothingToWithdraw();
        m.claimable = 0;
        config.token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ─── internals ───────────────────────────────────────────────────────────────
    function _autoPay(uint8 r, address who, Member storage m, uint256 c) private {
        m.misses++;
        uint256 need = c;
        uint256 fromEscrow = m.escrow >= need ? need : m.escrow;
        need -= fromEscrow;
        uint256 fromCredit = m.dividendCredit >= need ? need : m.dividendCredit;
        need -= fromCredit;
        uint256 fromSecurity;
        if (need > 0 && m.security >= need) fromSecurity = need;
        if (fromEscrow + fromCredit + fromSecurity < c) {
            // Can't cover it: take nothing, mark the member in default.
            m.inDefault = true;
            emit Defaulted(r, who);
            return;
        }
        m.escrow -= fromEscrow;
        m.dividendCredit -= fromCredit;
        m.security -= fromSecurity;
        paid[r][who] = true;
        collected += c;
        emit AutoPaid(r, who, fromEscrow, fromCredit, fromSecurity);
    }

    function _allPaid() private view returns (bool) {
        for (uint256 i; i < seats.length; ++i) if (!paid[round][seats[i]] && !members[seats[i]].inDefault) return false;
        return true;
    }

    function _finish() private {
        phase = Phase.Finished;
        for (uint256 i; i < seats.length; ++i) {
            Member storage m = members[seats[i]];
            m.claimable += m.security + m.escrow + m.dividendCredit;
            m.security = 0;
            m.escrow = 0;
            m.dividendCredit = 0;
        }
        // Indivisible remainders go to the foreman, so the contract ends empty.
        members[config.foreman].claimable += dust;
        dust = 0;
        emit Finished();
    }

    /// @dev Pulls tokens and rejects fee-on-transfer tokens, which would silently break the accounting.
    function _pull(uint256 amount) private {
        IERC20 t = config.token;
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        if (t.balanceOf(address(this)) - before != amount) revert FeeOnTransferToken();
    }
}
