pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../account/AuthereumAccount.sol";

/**
 * @title UpgradeAccountWithInit
 * @author Authereum Labs, Inc.
 * @dev A contract used to test upgrades. This contract does have an init function.
 */

contract UpgradeAccountWithInit is AuthereumAccount {

    uint256 public upgradeTestVal;

    /// @dev Function to call to test an upgrade with a new function
    /// @return A constant
    function upgradeTestInit() public {
        upgradeTestVal = 42;
    }

    /// @dev Function to call to test an upgrade with a new function
    /// @return An initialized constant
    function upgradeTest() public view returns (uint256) {
        return upgradeTestVal;
    }

    /// @dev Function to call to test an upgrade with a new function reading an old state
    /// @return The chain ID
    function getChainIdValue() public pure returns (uint256) {
        return getChainId();
    }
}
