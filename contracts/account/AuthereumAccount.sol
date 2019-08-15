pragma solidity ^0.5.8;

import "./Account.sol";
import "./LoginKeyMetaTxAccount.sol";
import "./AuthKeyMetaTxAccount.sol";

/**
 * AuthereumENSManager interface.
 */
contract AuthereumENSManager {
    function register(string calldata _label, address _owner) external {}
}

contract AuthereumAccount is Account, AuthKeyMetaTxAccount, LoginKeyMetaTxAccount, AuthereumENSManager {

    /// @dev Initialize the Authereum Account
    /// @param _authKey authKey that will own this account
    /// @param _authereumENSManager Address of the Authereum ENS Manager
    /// @param _label Label of the ENS name
    function initialize(
        address _authKey,
        address _authereumENSManager,
        string memory _label
    )
        public
        initializer
    {
        // Set the CHAIN_ID
        Account.initialize();
        TransactionLimit.initialize();

        // Add self as an authKey
        authKeys[_authKey] = true;
        authKeysArray.push(_authKey);
        authKeysArrayIndex[_authKey] = authKeysArray.length - 1;
        emit AddedAuthKey(_authKey);

        // Register user in ENS
        AuthereumENSManager(_authereumENSManager).register(_label, address(this));
    }
}
