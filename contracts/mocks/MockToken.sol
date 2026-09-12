// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Mock DEF Token
/// @author DeepSafe
/// @notice Provides a fixed initial supply for token-lock tests.
contract MockToken is ERC20 {
    /// @notice Mints the initial token supply to a recipient.
    /// @param recipient The address receiving the initial supply.
    /// @param amount The number of tokens minted.
    constructor(address recipient, uint256 amount) ERC20("Mock DEF", "MDEF") {
        _mint(recipient, amount);
    }
}
