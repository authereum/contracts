pragma solidity 0.5.16;

import "../state/AccountState.sol";
import "../event/AccountEvents.sol";

/**
 * @title AccountInitializeV1
 * @author Authereum Labs, Inc.
 * @dev This contract holds the initialize function used by the account contracts.
 * @dev This abstraction exists in order to retain the order of the initialization functions.
 */

contract AccountInitializeV1 is AccountState, AccountEvents {

    /// @dev Initialize the Authereum Account
    /// @param _authKey authKey that will own this account
    function initializeV1(
        address _authKey
    )
        public
    {
        require(lastInitializedVersion == 0, "AI: Improper initialization order");
        lastInitializedVersion = 1;

        // Add first authKey
        authKeys[_authKey] = true;
        numAuthKeys += 1;
        emit AuthKeyAdded(_authKey);
    }
}