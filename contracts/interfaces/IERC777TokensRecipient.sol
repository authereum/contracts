pragma solidity 0.5.17;

contract IERC777TokensRecipient {
    /// @dev Notify a send or mint (if from is 0x0) of amount tokens from the from address to the
    ///      to address by the operator address.
    /// @param operator Address which triggered the balance increase (through sending or minting).
    /// @param from Holder whose tokens were sent (or 0x0 for a mint).
    /// @param to Recipient of the tokens.
    /// @param amount Number of tokens the recipient balance is increased by.
    /// @param data Information provided by the holder.
    /// @param operatorData Information provided by the operator.
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData
    ) external;
}
