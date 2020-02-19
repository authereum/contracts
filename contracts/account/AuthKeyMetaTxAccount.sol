pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./BaseMetaTxAccount.sol";

/**
 * @title AuthKeyMetaTxAccount
 * @author Authereum Labs, Inc.
 * @dev Contract used by auth keys to send transactions.
 */

contract AuthKeyMetaTxAccount is BaseMetaTxAccount {

    /// @dev Execute multiple authKey meta transactions
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @param _gasPrice Gas price set by the user
    /// @param _gasOverhead Gas overhead of the transaction calculated offchain
    /// @param _feeTokenAddress Address of the token used to pay a fee
    /// @param _feeTokenRate Rate of the token (in tokenGasPrice/ethGasPrice) used to pay a fee
    /// @param _transactionMessageHashSignature Signed transaction data
    function executeMultipleAuthKeyMetaTransactions(
        bytes[] memory _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        address _feeTokenAddress,
        uint256 _feeTokenRate,
        bytes memory _transactionMessageHashSignature
    )
        public
        returns (bytes[] memory)
    {
        uint256 _startGas = gasleft();

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

        // Validate the signer
        // NOTE: This must be done prior to the _atomicExecuteMultipleMetaTransactions() call for security purposes
        _validateAuthKeyMetaTransactionSigs(
            _transactionMessageHash, _transactionMessageHashSignature
        );

        (, bytes[] memory _returnValues) = _atomicExecuteMultipleMetaTransactions(
            _transactions,
            _gasPrice,
            _gasOverhead,
            _feeTokenAddress,
            _feeTokenRate
        );

        if (_shouldRefund(_transactions)) {
          _issueRefund(_startGas, _gasPrice, _gasOverhead, _feeTokenAddress, _feeTokenRate);
        }

        return _returnValues;
    }

    /**
     *  Internal functions
     */

    /// @dev Validate signatures from an auth key meta transaction
    /// @param _transactionMessageHash Ethereum signed message of the transaction
    /// @param _transactionMessageHashSignature Signed transaction data
    /// @return Address of the auth key that signed the data
    function _validateAuthKeyMetaTransactionSigs(
        bytes32 _transactionMessageHash,
        bytes memory _transactionMessageHashSignature
    )
        internal
        view
    {
        address _authKey = _transactionMessageHash.recover(_transactionMessageHashSignature);
        require(_isValidAuthKey(_authKey), "AKMTA: Auth key is invalid");
    }

    /// @dev Check whether a refund should be issued
    /// @notice A refund should not be issued if the account is performing an Authereum-related update
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @return True if a refund should be issued
    function _shouldRefund(bytes[] memory _transactions) internal view returns (bool) {
        address _destination;
        for(uint i = 0; i < _transactions.length; i++) {
            (_destination,,,) = _decodeTransactionData(_transactions[i]);
            if (_destination != address(this)) return true;
        }

        return false;
    }
}