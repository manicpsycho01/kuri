// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockRupee} from "../contracts/MockRupee.sol";
import {KuriCircle} from "../contracts/KuriCircle.sol";
import {KuriFactory} from "../contracts/KuriFactory.sol";

/// Drives a circle with random actions from random members. Every call is allowed to fail;
/// what matters is that nothing that succeeds can ever break the accounting.
contract Handler is Test {
    KuriCircle public k;
    MockRupee public token;
    address[] public people;
    address public foreman;
    mapping(address => uint256) public wins;
    mapping(uint256 => uint16) public bidOf;

    constructor(KuriCircle k_, MockRupee t, address[] memory ps, address f) {
        k = k_;
        token = t;
        people = ps;
        foreman = f;
    }

    function who(uint256 seed) internal view returns (address) {
        return people[seed % people.length];
    }

    function pay(uint256 seed) external {
        vm.prank(who(seed));
        try k.pay() {} catch {}
    }

    function commit(uint256 seed, uint16 bps) external {
        address m = who(seed);
        bps = uint16(bound(bps, 0, 5000));
        bytes32 h = k.commitmentFor(m, k.round(), bps, bytes32(seed));
        vm.prank(m);
        try k.commit(h) {
            bidOf[uint256(uint160(m)) ^ k.round()] = bps;
        } catch {}
    }

    function reveal(uint256 seed) external {
        address m = who(seed);
        uint16 bps = bidOf[uint256(uint160(m)) ^ k.round()];
        // try every seed that maps to this member; only the one used at commit can match
        for (uint256 s = seed % people.length; s < seed % people.length + 3 * people.length; s += people.length) {
            vm.prank(m);
            try k.reveal(bps, bytes32(s)) {
                return;
            } catch {}
        }
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
    }

    function settle() external {
        uint8 r = k.round();
        try k.settle() {
            // record who won the round just settled
            for (uint256 i; i < people.length; ++i) {
                (, bool prized, , , , , , ) = k.members(people[i]);
                if (prized && wins[people[i]] == 0) {
                    wins[people[i]] = r + 1;
                }
            }
        } catch {}
    }

    function withdraw(uint256 seed, bool asForeman) external {
        vm.prank(asForeman ? foreman : who(seed));
        try k.withdraw() {} catch {}
    }
}

abstract contract InvariantBase is StdInvariant, Test {
    MockRupee token;
    KuriCircle k;
    Handler h;
    address[] people;
    address foreman = makeAddr("foreman");

    function build(bool escrow) internal {
        vm.warp(1_800_000_000);
        token = new MockRupee();
        KuriFactory f = new KuriFactory();
        vm.prank(foreman);
        k = KuriCircle(
            f.create(
                KuriCircle.Config({
                    token: token,
                    foreman: address(0),
                    size: 5,
                    contribution: 1_000 ether,
                    commitDuration: 1 hours,
                    revealDuration: 1 hours,
                    maxDiscountBps: 3000,
                    commissionBps: 500,
                    escrowPrize: escrow
                })
            )
        );
        for (uint256 i; i < 5; ++i) {
            address p = address(uint160(0x2000 + i));
            people.push(p);
            // some members are short of money, so defaults happen
            deal(address(token), p, i == 4 ? 1_500 ether : 50_000 ether);
            vm.startPrank(p);
            token.approve(address(k), type(uint256).max);
            k.join();
            vm.stopPrank();
        }
        h = new Handler(k, token, people, foreman);
        targetContract(address(h));
    }

    /// The circle's tokens always equal everything it owes.
    function invariant_solvent() public view {
        assertEq(token.balanceOf(address(k)), k.liabilities());
    }

    /// Nobody can ever be paid out more than has been put in.
    function invariant_no_money_from_nowhere() public view {
        uint256 total;
        for (uint256 i; i < people.length; ++i) total += token.balanceOf(people[i]);
        total += token.balanceOf(foreman) + token.balanceOf(address(k));
        assertEq(total, 4 * 50_000 ether + 1_500 ether, "tokens are only moved, never created or destroyed");
    }

    /// Each round has at most one winner, and the number of winners never exceeds the rounds settled.
    function invariant_one_prize_per_round() public view {
        uint256 prized;
        for (uint256 i; i < people.length; ++i) {
            (, bool p, , , , , , ) = k.members(people[i]);
            if (p) prized++;
        }
        uint256 settled = k.phase() == KuriCircle.Phase.Finished ? 5 : k.round();
        assertLe(prized, settled);
    }
}

contract InvariantTrust is InvariantBase {
    function setUp() public {
        build(false);
    }
}

/// Guards against a vacuous pass: the handler's random actions really do pay, bid, settle and finish circles.
contract HandlerReachesRealStates is InvariantBase {
    function setUp() public {
        build(false);
    }

    function test_random_play_settles_rounds_and_finishes() public {
        for (uint256 i; i < 400 && k.phase() != KuriCircle.Phase.Finished; ++i) {
            uint256 seed = uint256(keccak256(abi.encode(i)));
            uint256 action = seed % 6;
            if (action == 0) h.pay(seed);
            else if (action == 1) h.commit(seed, uint16(seed >> 8));
            else if (action == 2) h.reveal(seed);
            else if (action == 3) h.wait(seed % 2 hours);
            else if (action == 4) h.settle();
            else h.withdraw(seed, seed % 7 == 0);
            assertEq(token.balanceOf(address(k)), k.liabilities());
        }
        assertEq(uint8(k.phase()), uint8(KuriCircle.Phase.Finished), "random play should finish a circle");
    }
}

contract InvariantEscrow is InvariantBase {
    function setUp() public {
        build(true);
    }
}
