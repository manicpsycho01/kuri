// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaudiCoin} from "../contracts/KaudiCoin.sol";

/// Exposes the issuance counter so halving and the cap can be tested without millions of claims.
contract KaudiHarness is KaudiCoin {
    function setMinted(uint256 m) external { minted = m; }
}

contract KaudiCoinTest is Test {
    KaudiHarness kdi;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_800_000_000);
        kdi = new KaudiHarness();
    }

    function test_metadataAndFairLaunch() public view {
        assertEq(kdi.name(), "Kaudi");
        assertEq(kdi.symbol(), "KDI");
        assertEq(kdi.decimals(), 18);
        assertEq(kdi.totalSupply(), 0, "no pre-mine");
        assertEq(kdi.balanceOf(address(this)), 0, "the deployer gets nothing");
    }

    function test_claimOncePerDay() public {
        vm.prank(alice);
        assertEq(kdi.claim(), 100 ether);
        assertEq(kdi.balanceOf(alice), 100 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KaudiCoin.CoolingDown.selector, block.timestamp + 1 days));
        kdi.claim();
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        kdi.claim();
        assertEq(kdi.balanceOf(alice), 200 ether);
        vm.prank(bob); // other addresses aren't affected
        kdi.claim();
        assertEq(kdi.minted(), 300 ether);
    }

    function test_halvingSchedule() public {
        assertEq(kdi.currentDrip(), 100 ether);
        assertEq(kdi.eraEnd(0), 10_500_000 ether);
        assertEq(kdi.eraEnd(1), 15_750_000 ether);
        kdi.setMinted(10_500_000 ether);
        assertEq(kdi.era(), 1);
        assertEq(kdi.currentDrip(), 50 ether);
        kdi.setMinted(15_750_000 ether);
        assertEq(kdi.currentDrip(), 25 ether);
        kdi.setMinted(kdi.eraEnd(9));
        assertEq(kdi.era(), 10);
        assertEq(kdi.currentDrip(), uint256(100 ether) >> 10);
    }

    function test_eraEndsExactlyOnItsBoundary() public {
        kdi.setMinted(10_500_000 ether - 30 ether);
        vm.prank(alice);
        assertEq(kdi.claim(), 30 ether, "only what's left in the era");
        assertEq(kdi.minted(), 10_500_000 ether);
        vm.prank(bob);
        assertEq(kdi.claim(), 50 ether, "the next era pays half");
    }

    function test_issuanceRunsOutAndStops() public {
        kdi.setMinted(kdi.eraEnd(63));
        assertEq(kdi.era(), 64);
        assertEq(kdi.currentDrip(), 0);
        vm.prank(alice);
        vm.expectRevert(KaudiCoin.FullyIssued.selector);
        kdi.claim();
    }

    function test_neverPastTheCap() public {
        kdi.setMinted(kdi.eraEnd(63) - 1); // the very last era
        vm.prank(alice);
        uint256 got = kdi.claim();
        assertLe(kdi.minted(), kdi.MAX_SUPPLY());
        assertLe(got, 1);
        kdi.setMinted(21_000_000 ether);
        assertEq(kdi.currentDrip(), 0);
        vm.prank(bob);
        vm.expectRevert(KaudiCoin.FullyIssued.selector);
        kdi.claim();
    }

    function testFuzz_issuanceNeverExceedsCapOrEra(uint256 m) public {
        m = bound(m, 0, kdi.MAX_SUPPLY());
        kdi.setMinted(m);
        uint256 d = kdi.currentDrip();
        assertLe(m + d, kdi.MAX_SUPPLY());
        if (d > 0) assertLe(m + d, kdi.eraEnd(kdi.era()));
        assertLe(d, 100 ether);
    }

    function test_burnShrinksSupplyButNotIssuance() public {
        vm.prank(alice);
        kdi.claim();
        vm.prank(alice);
        kdi.burn(40 ether);
        assertEq(kdi.totalSupply(), 60 ether);
        assertEq(kdi.minted(), 100 ether, "burning doesn't free up new issuance");
    }

    function test_permitLetsSomeoneElsePayGas() public {
        (address owner, uint256 pk) = makeAddrAndKey("owner");
        vm.prank(owner);
        kdi.claim();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", kdi.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"), owner, bob, 25 ether, 0, deadline))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        kdi.permit(owner, bob, 25 ether, deadline, v, r, s);
        vm.prank(bob);
        kdi.transferFrom(owner, bob, 25 ether);
        assertEq(kdi.balanceOf(bob), 25 ether);
    }
}
