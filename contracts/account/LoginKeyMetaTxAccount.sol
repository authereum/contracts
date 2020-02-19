pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./BaseMetaTxAccount.sol";

/**
 * @title LoginKeyMetaTxAccount
 * @author Authereum Labs, Inc.
 * @dev Contract used by login keys to send transactions. Login key firwall checks
 * @dev are performed in this contract as well.
 */

contract LoginKeyMetaTxAccount is BaseMetaTxAccount {

    /// @dev Execute an loginKey meta transaction
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @param _gasPrice Gas price set by the user
    /// @param _gasOverhead Gas overhead of the transaction calculated offchain
    /// @param _loginKeyRestrictionsData Contains restrictions to the loginKey's functionality
    /// @param _feeTokenAddress Address of the token used to pay a fee
    /// @param _feeTokenRate Rate of the token (in tokenGasPrice/ethGasPrice) used to pay a fee
    /// @param _transactionMessageHashSignature Signed transaction data
    /// @param _loginKeyAttestationSignature Signed loginKey
    /// @return Response of the call
    function executeMultipleLoginKeyMetaTransactions(
        bytes[] memory _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        bytes memory _loginKeyRestrictionsData,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes memory _transactionMessageHashSignature,
        bytes memory _loginKeyAttestationSignature
    )
        public
        returns (bytes[] memory)
    {
        uint256 startGas = gasleft();

        _validateLoginKeyRestrictions(
            _transactions,
            _loginKeyRestrictionsData
        );

        // Hash the parameters
        bytes32 _transactionMessageHash = keccak256(abi.encode(
            address(this),
            msg.sig,
            getChainId(),
            nonce,
            _transactions,
            _gasPrice,
            _gasOverhead,
            _feeTokenAddress,
            _feeTokenRate
        )).toEthSignedMessageHash();

        // Validate the signers
        // NOTE: This must be done prior to the _atomicExecuteMultipleMetaTransactions() call for security purposes
        _validateLoginKeyMetaTransactionSigs(
            _transactionMessageHash, _transactionMessageHashSignature, _loginKeyRestrictionsData, _loginKeyAttestationSignature
        );

        (, bytes[] memory _returnValues) = _atomicExecuteMultipleMetaTransactions(
            _transactions,
            _gasPrice,
            _gasOverhead,
            _feeTokenAddress,
            _feeTokenRate
        );

        // Refund gas costs
        _issueRefund(startGas, _gasPrice, _gasOverhead, _feeTokenAddress, _feeTokenRate);

        return _returnValues;
    }

    /**
     *  Internal functions
     */

    /// @dev validates all loginKey Restrictions
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @param _loginKeyRestrictionsData Contains restrictions to the loginKey's functionality
    function _validateLoginKeyRestrictions(
        bytes[] memory _transactions,
        bytes memory _loginKeyRestrictionsData
    )
        internal
        view
    {
        // Check that no calls are made to self
        address _destination;
        for(uint i = 0; i < _transactions.length; i++) {
            (_destination,,,) = _decodeTransactionData(_transactions[i]);
            require(_destination != address(this), "LKMTA: Login key is not able to call self");
        }

        // Check _validateLoginKeyRestrictions restrictions
        uint256 loginKeyExpirationTime = abi.decode(_loginKeyRestrictionsData, (uint256));

        // Check that loginKey is not expired
        require(loginKeyExpirationTime > now, "LKMTA: Login key is expired");
    }

    /// @dev Validate signatures from an auth key meta transaction
    /// @param _transactionsMessageHash Ethereum signed message of the transaction
    /// @param _transactionMessgeHashSignature Signed transaction data
    /// @param _loginKeyRestrictionsData Contains restrictions to the loginKey's functionality
    /// @param _loginKeyAttestationSignature Signed loginKey
    /// @return Address of the login key that signed the data
    function _validateLoginKeyMetaTransactionSigs(
        bytes32 _transactionsMessageHash,
        bytes memory _transactionMessgeHashSignature,
        bytes memory _loginKeyRestrictionsData,
        bytes memory _loginKeyAttestationSignature
    )
        internal
        view
    {
        address _transactionMessageSigner = _transactionsMessageHash.recover(
            _transactionMessgeHashSignature
        );

        bytes32 loginKeyAttestationMessageHash = keccak256(abi.encode(
            _transactionMessageSigner,
            _loginKeyRestrictionsData
        )).toEthSignedMessageHash();

        address _authKeyAddress = loginKeyAttestationMessageHash.recover(
            _loginKeyAttestationSignature
        );

        require(_isValidAuthKey(_authKeyAddress), "LKMTA: Auth key is invalid");
    }
}