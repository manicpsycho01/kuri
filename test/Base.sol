// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockRupee} from "../contracts/MockRupee.sol";
import {KuriCircle} from "../contracts/KuriCircle.sol";
import {KuriFactory} from "../contracts/KuriFactory.sol";

/// Shared setup: a token, a factory, and helpers to fill a circle and play rounds.
abstract contract Base is Test {
    MockRupee token;
    KuriFactory factory;
    address foreman = makeAddr("foreman");
    uint256 constant C = 1_000 ether; // ₹1,000 a round

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        token = new MockRupee();
        factory = new KuriFactory();
    }

    function cfg(uint8 size, bool escrow) internal view returns (KuriCircle.Config memory) {
        return KuriCircle.Config({
            token: token,
            foreman: address(0),
            size: size,
            contribution: C,
            commitDuration: 1 days,
            revealDuration: 1 days,
            maxDiscountBps: 3000,
            commissionBps: 500,
            escrowPrize: escrow
        });
    }

    function newCircle(uint8 size, bool escrow) internal returns (KuriCircle k) {
        vm.prank(foreman);
        k = KuriCircle(factory.create(cfg(size, escrow)));
    }

    function member(uint256 i) internal pure returns (address) {
        return address(uint160(0x1000 + i));
    }

    /// Gives `who` another ₹1,00,000 (tests reuse members across circles, so the faucet's daily limit would bite).
    function fund(address who) internal {
        deal(address(token), who, token.balanceOf(who) + 100_000 ether);
    }

    /// Fills every seat with member(0..size-1), each funded and approved.
    function fill(KuriCircle k) internal {
        (, , uint8 size, , , , , , ) = k.config();
        for (uint256 i; i < size; ++i) {
            address m = member(i);
            fund(m);
            vm.startPrank(m);
            token.approve(address(k), type(uint256).max);
            k.join();
            vm.stopPrank();
        }
    }

    function payAll(KuriCircle k) internal {
        for (uint256 i; i < k.memberCount(); ++i) payAs(k, member(i));
    }

    function payAs(KuriCircle k, address m) internal {
        vm.prank(m);
        k.pay();
    }

    function bid(KuriCircle k, address m, uint16 bps, bytes32 salt) internal {
        bytes32 h = k.commitmentFor(m, k.round(), bps, salt);
        vm.prank(m);
        k.commit(h);
    }

    function openReveals(KuriCircle k) internal {
        vm.warp(k.commitEnd());
    }

    function revealAs(KuriCircle k, address m, uint16 bps, bytes32 salt) internal {
        vm.prank(m);
        k.reveal(bps, salt);
    }

    function closeRound(KuriCircle k) internal {
        vm.warp(k.revealEnd());
        k.settle();
    }

    function solvent(KuriCircle k) internal view {
        assertEq(token.balanceOf(address(k)), k.liabilities(), "token balance must equal liabilities");
    }

    function m_(KuriCircle k, address who) internal view returns (KuriCircle.Member memory m) {
        (m.seat, m.prized, m.inDefault, m.misses, m.security, m.escrow, m.dividendCredit, m.claimable) = k.members(who);
    }
}
