pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

interface ILoginKeyTransactionValidator {
    /// @dev Reverts if the transaction is invalid
    /// @param _transactions Arrays of transaction data ([to, value, gasLimit, data][...]...)
    /// @param _validationData Data used by the LoginKeyTransactionValidator and is signed in the 
    ///        login key attestation
    /// @param _relayerAddress Address that called the account contract
    function validateTransactions(
        bytes[] calldata _transactions,
        bytes calldata _validationData,
        address _relayerAddress
    ) external;

    /// @dev Called after a transaction is executed to record information about the transaction
    ///      and perform any post-execution validation
    /// @param _transactions Arrays of transaction data ([to, value, gasLimit, data][...]...)
    /// @param _validationData Data used by the LoginKeyTransactionValidator and is signed in the 
    ///        login key attestation
    /// @param _relayerAddress Address that called the account contract
    function transactionsDidExecute(
        bytes[] calldata _transactions,
        bytes calldata _validationData,
        address _relayerAddress
    ) external;
}