pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../account/AuthereumAccount.sol";

/**
 * @title UpgradeAccount
 * @author Authereum Labs, Inc.
 * @dev A contract used to test upgrades. This contract does not have an init function.
 */

contract UpgradeAccount is AuthereumAccount {

    /// @dev Function to call to test an upgrade with a new function
    /// @return A constant
    function upgradeTest() public pure returns (uint256) {
        return 42;
    }

    /// @dev Function to call to test an upgrade with a new function reading an old state
    /// @return The chain ID
    function getChainIdValue() public pure returns (uint256) {
        return getChainId();
    }
}
