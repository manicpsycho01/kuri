// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title Kaudi (KDI)
/// @notice A cowrie-shell coin with a fair launch and Bitcoin's issuance curve. There is no pre-mine and no owner:
///         every KDI is drawn from a public faucet, 100 KDI per address per day. Like Bitcoin, each era issues half
///         of what's left: the first 10.5M KDI pay 100 a claim, the next 5.25M pay 50, then 25… so the supply
///         approaches 21,000,000 and never passes it. Burning shrinks the supply but never frees up new issuance.
/// @dev A testnet coin for learning. One address can only claim once per day, but nothing stops someone from using
///      many addresses — on a real network, fair distribution needs more than a contract can enforce.
contract KaudiCoin is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant MAX_SUPPLY = 21_000_000 ether;
    uint256 public constant INITIAL_DRIP = 100 ether;
    uint256 public constant COOLDOWN = 1 days;

    /// @notice Total ever issued by the faucet (unlike totalSupply, burning doesn't lower it).
    uint256 public minted;
    mapping(address => uint256) public lastClaim;

    event Claimed(address indexed to, uint256 amount, uint256 era);

    error CoolingDown(uint256 availableAt);
    error FullyIssued();

    constructor() ERC20("Kaudi", "KDI") ERC20Permit("Kaudi") {}

    /// @notice Where era `e` ends: once 21M × (1 − 1/2^(e+1)) KDI have been issued (10.5M, 15.75M, 18.375M, …).
    function eraEnd(uint256 e) public pure returns (uint256) {
        return e >= 255 ? MAX_SUPPLY : MAX_SUPPLY - (MAX_SUPPLY >> (e + 1));
    }

    /// @notice The current halving era: 0 until 10.5M KDI are issued, then 1 until 15.75M, and so on.
    function era() public view returns (uint256 e) {
        while (e < 64 && minted >= eraEnd(e)) e++;
    }

    /// @notice What a claim pays right now: 100 KDI halved once per era, and never past the cap or the era's end.
    function currentDrip() public view returns (uint256 amount) {
        uint256 e = era();
        if (e >= 64) return 0;
        amount = INITIAL_DRIP >> e;
        uint256 end = eraEnd(e);
        if (minted + amount > end) amount = end - minted; // an era ends exactly on its boundary
        if (minted + amount > MAX_SUPPLY) amount = MAX_SUPPLY - minted;
    }

    /// @notice When `who` can claim next (0 if now).
    function nextClaimAt(address who) public view returns (uint256) {
        uint256 last = lastClaim[who];
        if (last == 0) return 0;
        uint256 next = last + COOLDOWN;
        return next > block.timestamp ? next : 0;
    }

    /// @notice Claim today's KDI.
    function claim() external returns (uint256 amount) {
        uint256 next = nextClaimAt(msg.sender);
        if (next != 0) revert CoolingDown(next);
        amount = currentDrip();
        if (amount == 0) revert FullyIssued();
        uint256 e = era();
        lastClaim[msg.sender] = block.timestamp;
        minted += amount;
        _mint(msg.sender, amount);
        emit Claimed(msg.sender, amount, e);
    }
}
