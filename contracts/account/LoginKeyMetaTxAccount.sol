pragma solidity ^0.5.8;

import "./Account.sol";
import "../firewall/TransactionLimit.sol";

contract LoginKeyMetaTxAccount is Account, TransactionLimit {

    /// @dev Check if a loginKey is valid
    /// @param transactionDataSigner loginKey that signed the tx data
    /// @param _loginKeyAuthorizationSignature Signed loginKey
    function isValidLoginKey(
        address transactionDataSigner,
        bytes memory _loginKeyAuthorizationSignature
    )
        public
        view
        returns (bool)
    {
        bytes32 loginKeyAuthorizationMessageHash = keccak256(abi.encodePacked(
            transactionDataSigner
        )).toEthSignedMessageHash();

        address authorizationSigner = loginKeyAuthorizationMessageHash.recover(
            _loginKeyAuthorizationSignature
        );

        return authKeys[authorizationSigner];
    }

    /// @dev Execute an loginKey meta transaction
    /// @param _destination Destination of the transaction
    /// @param _data Data of the transaction
    /// @param _value Value of the transaction
    /// @param _gasLimit Gas limit of the transaction
    /// @param _transactionDataSignature Signed tx data
    /// @param _loginKeyAuthorizationSignature Signed loginKey
    function executeLoginKeyMetaTx(
        address _destination,
        bytes memory _data,
        uint256 _value,
        uint256 _gasLimit,
        bytes memory _transactionDataSignature,
        bytes memory _loginKeyAuthorizationSignature
    )
        public
        returns (bytes memory)
    {
        uint256 startGas = gasleft();

        // This is only in loginKey because authKeys are not restricted by firewalls
        checkFirewall(_value);

        bytes32 _txDataMessageHash = keccak256(abi.encodePacked(
            address(this),
            msg.sig,
            CHAIN_ID,
            _destination,
            _data,
            _value,
            nonce,
            tx.gasprice,
            _gasLimit
        )).toEthSignedMessageHash();

        address transactionDataSigner = validateLoginKeyMetaTxSigs(
            _txDataMessageHash, _transactionDataSignature, _loginKeyAuthorizationSignature
        );

        bytes memory response = _executeTransactionWithRefund(
            _destination, _value, _data, tx.gasprice, _gasLimit, startGas
        );

        return response;
    }

    /// @dev Check to see if the transaction passes the firewall
    /// @param _value Value of the transaction being sent
    function checkFirewall(uint256 _value) public {
        bool _isWithinDailyLimit = checkAndUpdateEthDailyTransactionLimit(_value);
        require(_isWithinDailyLimit, "Transaction not within daily limit");
    }
}