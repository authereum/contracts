pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "./BaseMetaTxAccount.sol";
import "../interfaces/ILoginKeyTransactionValidator.sol";

/**
 * @title LoginKeyMetaTxAccount
 * @author Authereum Labs, Inc.
 * @dev Contract used by login keys to send transactions. Login key firwall checks
 * @dev are performed in this contract as well.
 */

contract LoginKeyMetaTxAccount is BaseMetaTxAccount {

    /// @dev Execute an loginKey meta transaction
    /// @param _transactions Arrays of transaction data ([to, value, gasLimit, data][...]...)
    /// @param _gasPrice Gas price set by the user
    /// @param _gasOverhead Gas overhead of the transaction calculated offchain
    /// @param _loginKeyRestrictionsData Contains restrictions to the loginKey's functionality
    /// @param _feeTokenAddress Address of the token used to pay a fee
    /// @param _feeTokenRate Rate of the token (in tokenGasPrice/ethGasPrice) used to pay a fee
    /// @param _transactionMessageHashSignature Signed transaction data
    /// @param _loginKeyAttestationSignature Signed loginKey
    /// @return Return values of the call
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

        _validateDestinations(_transactions);
        _validateRestrictionDataPreHook(_transactions, _loginKeyRestrictionsData);

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

        (bool success, bytes[] memory _returnValues) = _atomicExecuteMultipleMetaTransactions(
            _transactions,
            _gasPrice
        );

        // If transaction batch succeeded
        if (success) {
            _validateRestrictionDataPostHook(_transactions, _loginKeyRestrictionsData);
        }

        // Refund gas costs
        _issueRefund(startGas, _gasPrice, _gasOverhead, _feeTokenAddress, _feeTokenRate);

        return _returnValues;
    }

    /**
     *  Internal functions
     */

    /// @dev Decodes the loginKeyRestrictionsData and calls the ILoginKeyTransactionValidator contract's pre-execution hook
    /// @param _transactions The encoded transactions being executed
    /// @param _loginKeyRestrictionsData The encoded data used by the ILoginKeyTransactionValidator contract
    function _validateRestrictionDataPreHook(
        bytes[] memory _transactions,
        bytes memory _loginKeyRestrictionsData
    )
        internal
    {
        (address validationContract, bytes memory validationData) = abi.decode(_loginKeyRestrictionsData, (address, bytes));
        if (validationContract != address(0)) {
            ILoginKeyTransactionValidator(validationContract).validateTransactions(_transactions, validationData, msg.sender);
        }
    }

    /// @dev Decodes the loginKeyRestrictionsData and calls the ILoginKeyTransactionValidator contract's post-execution hook
    /// @param _transactions The encoded transactions being executed
    /// @param _loginKeyRestrictionsData The encoded data used by the ILoginKeyTransactionValidator contract
    function _validateRestrictionDataPostHook(
        bytes[] memory _transactions,
        bytes memory _loginKeyRestrictionsData
    )
        internal
    {
        (address validationContract, bytes memory validationData) = abi.decode(_loginKeyRestrictionsData, (address, bytes));
        if (validationContract != address(0)) {
            ILoginKeyTransactionValidator(validationContract).transactionsDidExecute(_transactions, validationData, msg.sender);
        }
    }

    /// @dev Validates all loginKey Restrictions
    /// @param _transactions Arrays of transaction data ([to, value, gasLimit, data][...]...)
    function _validateDestinations(
        bytes[] memory _transactions
    )
        internal
        view
    {
        // Check that calls made to self and auth keys have no data and are limited in gas
        address to;
        uint256 gasLimit;
        bytes memory data;
        for (uint i = 0; i < _transactions.length; i++) {
            (to,,gasLimit,data) = _decodeTransactionData(_transactions[i]);

            if (data.length != 0 || gasLimit > 2300) {
                require(to != address(this), "LKMTA: Login key is not able to call self");
                require(!authKeys[to], "LKMTA: Login key is not able to call an Auth key");
            }
        }
    }

    /// @dev Validate signatures from an auth key meta transaction
    /// @param _transactionsMessageHash Ethereum signed message of the transaction
    /// @param _transactionMessageHashSignature Signed transaction data
    /// @param _loginKeyRestrictionsData Contains restrictions to the loginKey's functionality
    /// @param _loginKeyAttestationSignature Signed loginKey
    /// @return Address of the login key that signed the data
    function _validateLoginKeyMetaTransactionSigs(
        bytes32 _transactionsMessageHash,
        bytes memory _transactionMessageHashSignature,
        bytes memory _loginKeyRestrictionsData,
        bytes memory _loginKeyAttestationSignature
    )
        internal
        view
    {
        address _transactionMessageSigner = _transactionsMessageHash.recover(
            _transactionMessageHashSignature
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