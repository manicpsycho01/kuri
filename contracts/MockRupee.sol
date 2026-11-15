// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockRupee (tINR)
/// @notice A play-money rupee for testnets. Anyone can draw from the faucet once a day.
/// @dev Has no owner and no admin mint: the only way to get tINR is the faucet, for everyone equally.
contract MockRupee is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100_000 ether; // ₹1,00,000 (18 decimals)
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastDrip;

    error FaucetCoolingDown(uint256 availableAt);

    constructor() ERC20("Test Rupee", "tINR") {}

    /// @notice Mints FAUCET_AMOUNT to the caller, at most once per FAUCET_COOLDOWN.
    function faucet() external {
        uint256 next = lastDrip[msg.sender] + FAUCET_COOLDOWN;
        if (lastDrip[msg.sender] != 0 && block.timestamp < next) revert FaucetCoolingDown(next);
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
