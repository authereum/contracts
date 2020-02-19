pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "./BaseAccount.sol";

/**
 * @title BaseMetaTxAccount
 * @author Authereum Labs, Inc.
 * @dev Contract that lays the foundations for meta transactions
 * @dev are performed in this contract as well.
 */

contract BaseMetaTxAccount is BaseAccount {

    /**
     * Public functions
     */

    /// @dev Execute multiple meta transactions
    /// @notice This can only be called by self as a part of the atomic meta transaction
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @return The responses of the calls
    function executeMultipleMetaTransactions(bytes[] memory _transactions) public onlyAuthKeySenderOrSelf returns (bytes[] memory) {
        return _executeMultipleMetaTransactions(_transactions);
    }

    /**
     *  Internal functions
     */

    /// @dev Atomically execute a meta transaction
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @param _gasPrice Gas price set by the user
    /// @param _gasOverhead Gas overhead of the transaction calculated offchain
    /// @param _feeTokenAddress Address of the token used to pay a fee
    /// @param _feeTokenRate Rate of the token (in tokenGasPrice/ethGasPrice) used to pay a fee
    /// @return The _transactionMessageHash and responses of the calls
    function _atomicExecuteMultipleMetaTransactions(
        bytes[] memory _transactions,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        address _feeTokenAddress,
        uint256 _feeTokenRate
    )
        internal
        returns (bytes32, bytes[] memory)
    {
        // Verify that the relayer gasPrice is acceptable
        require(_gasPrice <= tx.gasprice, "BMTA: Not a large enough tx.gasprice");

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

        // Increment nonce by the number of transactions being processed
        // NOTE: The nonce will still increment even if batched transactions fail atomically
        // NOTE: The reason for this is to mimic an EOA as closely as possible
        nonce += _transactions.length;

        bytes memory _encodedTransactions = abi.encodeWithSelector(
            this.executeMultipleMetaTransactions.selector,
            _transactions
        );

        (bool success, bytes memory res) = address(this).call(_encodedTransactions);

        // Check if any of the atomic transactions failed, if not, decode return data
        bytes[] memory _returnValues;
        if (!success) {
            string memory _revertMsg = _getRevertMsg(res);
            emit CallFailed(_revertMsg);
        } else {
            _returnValues = abi.decode(res, (bytes[]));
        }

        return (_transactionMessageHash, _returnValues);
    }

    /// @dev Execute a meta transaction
    /// @param _transactions Arrays of transaction data ([destination, value, gasLimit, data][...]...)
    /// @return The responses of the calls
    function _executeMultipleMetaTransactions(bytes[] memory _transactions) internal returns (bytes[] memory) {
        // Execute transactions individually
        bytes[] memory _returnValues = new bytes[](_transactions.length);
        for(uint i = 0; i < _transactions.length; i++) {
            // Execute the transaction
            _returnValues[i] = _decodeAndExecuteTransaction(_transactions[i]);
        }

        return _returnValues;
    }

    /// @dev Decode and execute a meta transaction
    /// @param _transaction Transaction (destination, value, gasLimit, data)
    /// @return Succcess status and response of the call
    function _decodeAndExecuteTransaction(bytes memory _transaction) internal returns (bytes memory) {
        (address _destination, uint256 _value, uint256 _gasLimit, bytes memory _data) = _decodeTransactionData(_transaction);

        // Execute the transaction
        return _executeTransaction(
            _destination, _value, _gasLimit, _data
        );
    }

    /// @dev Decode transaction data
    /// @param _transaction Transaction (destination, value, gasLimit, data)
    function _decodeTransactionData(bytes memory _transaction) internal pure returns (address, uint256, uint256, bytes memory) {
        return abi.decode(_transaction, (address, uint256, uint256, bytes));
    }

    /// @dev Issue a refund
    /// @param _startGas Starting gas at the beginning of the transaction
    /// @param _gasPrice Gas price to use when sending a refund
    /// @param _gasOverhead Gas overhead of the transaction calculated offchain
    /// @param _feeTokenAddress Address of the token used to pay a fee
    /// @param _feeTokenRate Rate of the token (in tokenGasPrice/ethGasPrice) used to pay a fee
    function _issueRefund(
        uint256 _startGas,
        uint256 _gasPrice,
        uint256 _gasOverhead,
        address _feeTokenAddress,
        uint256 _feeTokenRate
    )
        internal
    {
        uint256 _gasUsed = _startGas.sub(gasleft()).add(_gasOverhead);

        // Pay refund in ETH if _feeTokenAddress is 0. Else, pay in the token
        if (_feeTokenAddress == address(0)) {
            require(_gasUsed.mul(_gasPrice) <= address(this).balance, "BA: Insufficient gas (ETH) for refund");
            // NOTE: The return value is not checked because the relayer should not propagate a transaction that will revert
            // NOTE: and malicious behavior by the relayer here will cost the relayer, as the fee is already calculated
            msg.sender.call.value(_gasUsed.mul(_gasPrice))("");
        } else {
            IERC20 feeToken = IERC20(_feeTokenAddress);
            uint256 totalTokenFee = _gasUsed.mul(_feeTokenRate);
            require(totalTokenFee <= feeToken.balanceOf(address(this)), "BA: Insufficient gas (token) for refund");
            // NOTE: The return value is not checked because the relayer should not propagate a transaction that will revert
            feeToken.transfer(msg.sender, totalTokenFee);
        }
    }
}