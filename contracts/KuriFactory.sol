// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {KuriCircle} from "./KuriCircle.sol";

/// @title KuriFactory
/// @notice Starts new circles. Each circle is a cheap clone (EIP-1167) of one audited implementation, so every circle
///         runs exactly the same code and keeps its money separate from every other circle.
contract KuriFactory {
    address public immutable implementation;
    address[] public circles;

    event CircleCreated(address indexed circle, address indexed foreman, address token, uint8 size, uint256 contribution, bool escrowPrize);

    constructor() {
        implementation = address(new KuriCircle());
    }

    /// @notice Create a circle with you as its foreman. `c.foreman` is ignored and set to the caller.
    function create(KuriCircle.Config calldata c) external returns (address circle) {
        KuriCircle.Config memory cfg = c;
        cfg.foreman = msg.sender;
        circle = Clones.clone(implementation);
        KuriCircle(circle).initialize(cfg);
        circles.push(circle);
        emit CircleCreated(circle, msg.sender, address(cfg.token), cfg.size, cfg.contribution, cfg.escrowPrize);
    }

    function circleCount() external view returns (uint256) {
        return circles.length;
    }
}
