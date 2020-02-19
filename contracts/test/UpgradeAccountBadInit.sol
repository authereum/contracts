pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../account/AuthereumAccount.sol";

/**
 * @title UpgradeAccountBadInit
 * @author Authereum Labs, Inc.
 * @dev A contract used to test failing initializations.
 */

contract UpgradeAccountBadInit is AuthereumAccount {

    /// @dev Function to call to test an upgrade with a new function
    function upgradeTest() public pure {
        require(false, 'Upgrade failed');
    }
}
