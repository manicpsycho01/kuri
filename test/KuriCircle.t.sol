// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.sol";
import {KuriCircle} from "../contracts/KuriCircle.sol";
import {MockRupee} from "../contracts/MockRupee.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract KuriCircleTest is Base {
    // ─── setup and enrolment ─────────────────────────────────────────────────────
    function test_faucet_gives_play_money_once_a_day() public {
        address a = makeAddr("a");
        vm.prank(a);
        token.faucet();
        assertEq(token.balanceOf(a), 100_000 ether);
        vm.prank(a);
        vm.expectRevert(abi.encodeWithSelector(MockRupee.FaucetCoolingDown.selector, block.timestamp + 1 days));
        token.faucet();
        vm.warp(block.timestamp + 1 days);
        vm.prank(a);
        token.faucet();
        assertEq(token.balanceOf(a), 200_000 ether);
    }

    function test_config_is_validated() public {
        KuriCircle.Config memory c = cfg(4, true);
        c.size = 2;
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadConfig.selector, "size"));
        factory.create(c);
        c = cfg(4, true);
        c.maxDiscountBps = 4500;
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadConfig.selector, "discount cap"));
        factory.create(c);
        c = cfg(4, true);
        c.commissionBps = 800;
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadConfig.selector, "commission"));
        factory.create(c);
    }

    function test_the_implementation_cannot_be_initialised() public {
        KuriCircle impl = KuriCircle(factory.implementation());
        vm.expectRevert();
        impl.initialize(cfg(4, true));
    }

    function test_foreman_is_always_the_creator() public {
        KuriCircle.Config memory c = cfg(4, true);
        c.foreman = makeAddr("someone else");
        vm.prank(foreman);
        KuriCircle k = KuriCircle(factory.create(c));
        (, address f, , , , , , , ) = k.config();
        assertEq(f, foreman);
    }

    function test_joining_posts_security_and_the_last_seat_starts_the_circle() public {
        KuriCircle k = newCircle(4, true);
        fill(k);
        assertEq(uint8(k.phase()), uint8(KuriCircle.Phase.Active));
        assertEq(k.roundStart(), block.timestamp);
        assertEq(token.balanceOf(address(k)), 4 * C);
        assertEq(m_(k, member(2)).security, C);
        assertEq(m_(k, member(2)).seat, 3);
        solvent(k);
    }

    function test_no_double_seats_and_no_joining_a_full_circle() public {
        KuriCircle k = newCircle(3, true);
        fund(member(0));
        vm.startPrank(member(0));
        token.approve(address(k), type(uint256).max);
        k.join();
        vm.expectRevert(KuriCircle.AlreadyMember.selector);
        k.join();
        vm.stopPrank();
        KuriCircle k2 = newCircle(3, true);
        fill(k2);
        address late = makeAddr("late");
        fund(late);
        vm.startPrank(late);
        token.approve(address(k2), type(uint256).max);
        vm.expectRevert(KuriCircle.WrongPhase.selector);
        k2.join();
        vm.stopPrank();
    }

    function test_cancel_before_full_refunds_security_and_only_the_foreman_can() public {
        KuriCircle k = newCircle(4, true);
        fund(member(0));
        vm.startPrank(member(0));
        token.approve(address(k), type(uint256).max);
        k.join();
        vm.expectRevert(KuriCircle.OnlyForeman.selector);
        k.cancel();
        vm.stopPrank();
        vm.prank(foreman);
        k.cancel();
        uint256 before = token.balanceOf(member(0));
        vm.prank(member(0));
        k.withdraw();
        assertEq(token.balanceOf(member(0)) - before, C);
        assertEq(token.balanceOf(address(k)), 0);
    }

    // ─── the auction ─────────────────────────────────────────────────────────────
    function test_a_full_round_pays_prize_commission_and_dividends_exactly() public {
        KuriCircle k = newCircle(4, false); // TRUST mode: prize paid in full
        fill(k);
        payAll(k);
        bid(k, member(1), 2000, "a"); // 20%
        bid(k, member(2), 2500, "b"); // 25% — wins
        openReveals(k);
        revealAs(k, member(1), 2000, "a");
        revealAs(k, member(2), 2500, "b");
        closeRound(k);
        // pot 4,000; discount 25% = 1,000; commission 5% = 200; dividend pool 800 → 200 each
        assertEq(m_(k, member(2)).claimable, 3_000 ether + k.bond(), "prize 3,000 + bond back");
        assertEq(m_(k, foreman).claimable, 200 ether);
        for (uint256 i; i < 4; ++i) assertEq(m_(k, member(i)).dividendCredit, 200 ether);
        assertTrue(m_(k, member(2)).prized);
        assertEq(k.round(), 1);
        solvent(k);
    }

    function test_dividend_credit_reduces_the_next_instalment() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        closeRound(k); // no bids: seat 1 wins at the 5% minimum discount → no dividend beyond 0
        assertEq(m_(k, member(1)).dividendCredit, 0);
        payAll(k);
        bid(k, member(1), 3000, "x");
        openReveals(k);
        revealAs(k, member(1), 3000, "x");
        closeRound(k); // discount 1,200 − commission 200 = 1,000 → 250 each
        assertEq(k.dueNow(member(3)), C - 250 ether);
        uint256 before = token.balanceOf(member(3));
        payAs(k, member(3));
        assertEq(before - token.balanceOf(member(3)), C - 250 ether);
        solvent(k);
    }

    function test_ties_go_to_the_lower_seat() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bid(k, member(3), 2000, "c");
        bid(k, member(1), 2000, "a");
        openReveals(k);
        revealAs(k, member(3), 2000, "c");
        revealAs(k, member(1), 2000, "a");
        closeRound(k);
        assertTrue(m_(k, member(1)).prized);
        assertFalse(m_(k, member(3)).prized);
    }

    function test_reveals_must_match_and_come_after_bidding_closes() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bid(k, member(1), 2000, "salt");
        vm.prank(member(1));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadReveal.selector, "bidding still open"));
        k.reveal(2000, "salt");
        openReveals(k);
        vm.prank(member(1));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadReveal.selector, "does not match commitment"));
        k.reveal(2900, "salt"); // trying to raise the bid after seeing others
        revealAs(k, member(1), 2000, "salt");
        vm.prank(member(1));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadReveal.selector, "already revealed"));
        k.reveal(2000, "salt");
    }

    function test_a_commitment_cannot_be_copied_by_another_member() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bytes32 h = k.commitmentFor(member(1), 0, 2500, "s");
        vm.prank(member(1));
        k.commit(h);
        vm.prank(member(2));
        k.commit(h); // copies the hash, hoping to reveal the same numbers
        openReveals(k);
        vm.prank(member(2));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.BadReveal.selector, "does not match commitment"));
        k.reveal(2500, "s"); // the hash is bound to member(1)
    }

    function test_out_of_range_bids_do_not_count_but_get_their_bond_back() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bid(k, member(1), 9000, "greedy"); // above the 30% cap
        bid(k, member(2), 100, "cheap"); // below the 5% commission
        bid(k, member(3), 1000, "ok");
        openReveals(k);
        revealAs(k, member(1), 9000, "greedy");
        revealAs(k, member(2), 100, "cheap");
        revealAs(k, member(3), 1000, "ok");
        closeRound(k);
        assertTrue(m_(k, member(3)).prized);
        assertEq(m_(k, member(1)).claimable, k.bond());
    }

    function test_an_unrevealed_bid_forfeits_its_bond_into_the_dividend() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bid(k, member(1), 2000, "never revealed");
        closeRound(k);
        // seat 1 (member 0) wins at the minimum; the 50 bond is shared: 4 × 12.5
        assertTrue(m_(k, member(0)).prized);
        assertEq(m_(k, member(2)).dividendCredit, k.bond() / 4);
        solvent(k);
    }

    function test_who_may_bid() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        bytes32 h = keccak256("x");
        vm.prank(member(0));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.NotEligible.selector, "pay this round first"));
        k.commit(h);
        payAll(k);
        vm.prank(makeAddr("outsider"));
        vm.expectRevert(KuriCircle.NotMember.selector);
        k.commit(h);
        bid(k, member(0), 2000, "a");
        vm.prank(member(0));
        vm.expectRevert(KuriCircle.AlreadyCommitted.selector);
        k.commit(h);
        openReveals(k);
        revealAs(k, member(0), 2000, "a");
        closeRound(k);
        payAll(k);
        vm.prank(member(0)); // already won
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.NotEligible.selector, "already won"));
        k.commit(h);
        vm.warp(k.commitEnd());
        vm.prank(member(1));
        vm.expectRevert(KuriCircle.WindowClosed.selector);
        k.commit(h);
    }

    function test_settle_waits_for_the_windows() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        vm.expectRevert(KuriCircle.WindowNotOver.selector);
        k.settle();
    }

    // ─── a whole circle, both modes ──────────────────────────────────────────────
    function test_a_whole_circle_everyone_wins_once_and_the_contract_ends_empty() public {
        for (uint256 mode; mode < 2; ++mode) {
            KuriCircle k = newCircle(5, mode == 1);
            fill(k);
            for (uint8 r; r < 5; ++r) {
                payAll(k);
                if (r < 4) {
                    // the lowest unprized seat bids 10% + r%
                    for (uint256 i; i < 5; ++i) {
                        if (!m_(k, member(i)).prized) {
                            bid(k, member(i), uint16(1000 + 100 * uint256(r)), bytes32(uint256(r)));
                            openReveals(k);
                            revealAs(k, member(i), uint16(1000 + 100 * uint256(r)), bytes32(uint256(r)));
                            break;
                        }
                    }
                }
                closeRound(k);
                solvent(k);
            }
            assertEq(uint8(k.phase()), uint8(KuriCircle.Phase.Finished));
            for (uint256 i; i < 5; ++i) assertTrue(m_(k, member(i)).prized);
            for (uint256 i; i < 5; ++i) {
                vm.prank(member(i));
                k.withdraw();
            }
            vm.prank(foreman);
            k.withdraw();
            assertEq(token.balanceOf(address(k)), 0, "everything paid out");
        }
    }

    function test_the_last_round_settles_as_soon_as_everyone_has_paid() public {
        KuriCircle k = newCircle(3, false);
        fill(k);
        for (uint8 r; r < 2; ++r) {
            payAll(k);
            closeRound(k);
        }
        payAll(k);
        k.settle(); // no auction to wait for
        assertEq(uint8(k.phase()), uint8(KuriCircle.Phase.Finished));
        assertTrue(m_(k, member(2)).prized);
    }

    // ─── defaults ────────────────────────────────────────────────────────────────
    function test_trust_mode_one_miss_is_paid_from_security_the_second_puts_you_in_default() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        // round 0: member 3 doesn't pay
        for (uint256 i; i < 3; ++i) payAs(k, member(i));
        closeRound(k);
        assertEq(m_(k, member(3)).security, 0, "security used");
        assertFalse(m_(k, member(3)).inDefault);
        assertTrue(k.paid(0, member(3)));
        // round 1: misses again, and has no dividend credit to cover it
        for (uint256 i; i < 3; ++i) payAs(k, member(i));
        closeRound(k);
        assertTrue(m_(k, member(3)).inDefault);
        assertFalse(k.paid(1, member(3)));
        // a member in default can't bid
        vm.prank(member(3));
        vm.expectRevert(abi.encodeWithSelector(KuriCircle.NotEligible.selector, "in default"));
        k.commit(keccak256("x"));
        solvent(k);
    }

    function test_trust_mode_a_defaulting_winner_shrinks_the_pot_but_never_the_solvency() public {
        KuriCircle k = newCircle(4, false);
        fill(k);
        payAll(k);
        bid(k, member(2), 3000, "run");
        openReveals(k);
        revealAs(k, member(2), 3000, "run");
        closeRound(k);
        vm.prank(member(2));
        k.withdraw(); // takes the money and stops paying
        for (uint8 r = 1; r < 4; ++r) {
            for (uint256 i; i < 4; ++i) if (i != 2 && !m_(k, member(i)).inDefault) payAs(k, member(i));
            closeRound(k);
            solvent(k);
        }
        assertTrue(m_(k, member(2)).inDefault);
        assertEq(uint8(k.phase()), uint8(KuriCircle.Phase.Finished));
    }

    function test_escrow_mode_a_winner_cannot_default_on_money_already_received() public {
        KuriCircle k = newCircle(4, true);
        fill(k);
        payAll(k);
        bid(k, member(2), 1000, "early");
        openReveals(k);
        revealAs(k, member(2), 1000, "early");
        closeRound(k);
        // prize 3,600; three instalments (3,000) held back; 600 paid out
        assertEq(m_(k, member(2)).escrow, 3 * C);
        assertEq(m_(k, member(2)).claimable, 600 ether + k.bond());
        vm.prank(member(2));
        k.withdraw();
        for (uint8 r = 1; r < 4; ++r) {
            for (uint256 i; i < 4; ++i) if (i != 2) payAs(k, member(i));
            closeRound(k);
            assertTrue(k.paid(r, member(2)), "paid from escrow");
            assertFalse(m_(k, member(2)).inDefault);
            solvent(k);
        }
    }

    // ─── hostile tokens ──────────────────────────────────────────────────────────
    function test_fee_on_transfer_tokens_are_rejected() public {
        FeeToken bad = new FeeToken();
        KuriCircle.Config memory c = cfg(3, true);
        c.token = bad;
        vm.prank(foreman);
        KuriCircle k = KuriCircle(factory.create(c));
        bad.mint(member(0), 10_000 ether);
        vm.startPrank(member(0));
        bad.approve(address(k), type(uint256).max);
        vm.expectRevert(KuriCircle.FeeOnTransferToken.selector);
        k.join();
        vm.stopPrank();
    }

    function test_reentrancy_through_a_token_callback_is_blocked() public {
        ReentrantToken evil = new ReentrantToken();
        KuriCircle.Config memory c = cfg(3, false);
        c.token = evil;
        vm.prank(foreman);
        KuriCircle k = KuriCircle(factory.create(c));
        evil.setTarget(k);
        for (uint256 i; i < 3; ++i) {
            evil.mint(member(i), 10_000 ether);
            vm.startPrank(member(i));
            evil.approve(address(k), type(uint256).max);
            k.join();
            vm.stopPrank();
        }
        vm.prank(foreman);
        vm.expectRevert(KuriCircle.WrongPhase.selector);
        k.cancel(); // circle is active
        evil.arm();
        vm.prank(member(0));
        vm.expectRevert(); // the callback re-enters withdraw() during pay() and is stopped by the guard
        k.pay();
    }

    // ─── fuzz ────────────────────────────────────────────────────────────────────
    /// Any bids, any sizes: the pot is always split exactly, and the winner is the highest valid bid.
    function testFuzz_round_split_is_exact(uint8 size, uint16 b1, uint16 b2, bool escrow) public {
        size = uint8(bound(size, 3, 12));
        KuriCircle k = newCircle(size, escrow);
        fill(k);
        payAll(k);
        uint256 before = token.balanceOf(address(k));
        bid(k, member(0), b1, "a");
        bid(k, member(1), b2, "b");
        openReveals(k);
        revealAs(k, member(0), b1, "a");
        revealAs(k, member(1), b2, "b");
        closeRound(k);
        solvent(k);
        assertEq(token.balanceOf(address(k)), before + 2 * k.bond());
        bool v1 = b1 >= 500 && b1 <= 3000;
        bool v2 = b2 >= 500 && b2 <= 3000;
        address expected = (v1 && (!v2 || b1 >= b2)) ? member(0) : v2 ? member(1) : member(0);
        assertTrue(m_(k, expected).prized, "highest valid bid wins; ties and no-bids go to seat 1");
    }
}

contract FeeToken is ERC20("Fee", "FEE") {
    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0xdead), value / 100);
            value -= value / 100;
        }
        super._update(from, to, value);
    }
}

contract ReentrantToken is ERC20("Evil", "EVL") {
    KuriCircle target;
    bool armed;

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function setTarget(KuriCircle t) external {
        target = t;
    }

    function arm() external {
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && to == address(target)) {
            armed = false;
            target.withdraw();
        }
    }
}
