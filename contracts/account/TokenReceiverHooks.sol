pragma solidity 0.5.16;

contract TokenReceiverHooks {
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = 0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b;
    bytes32 constant private ERC1820_ACCEPT_MAGIC = keccak256(abi.encodePacked("ERC1820_ACCEPT_MAGIC"));

    /**
     *  ERC721
     */

    /**
     * @notice Handle the receipt of an NFT
     * @dev The ERC721 smart contract calls this function on the recipient
     * after a {IERC721-safeTransferFrom}. This function MUST return the function selector,
     * otherwise the caller will revert the transaction. The selector to be
     * returned can be obtained as `this.onERC721Received.selector`. This
     * function MAY throw to revert and reject the transfer.
     * Note: the ERC721 contract address is always the message sender.
     * param operator The address which called `safeTransferFrom` function
     * param from The address which previously owned the token
     * param tokenId The NFT identifier which is being transferred
     * param data Additional data with no specified format
     * @return bytes4 `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
     */
    function onERC721Received(address, address, uint256, bytes memory) public returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     *  ERC1155
     */

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns(bytes4) {
        return this.onERC1155Received.selector;
    }

    /**
     * @notice Handle the receipt of multiple ERC1155 token types.
     * @dev An ERC1155-compliant smart contract MUST call this function on the token recipient contract, at the end of a `safeBatchTransferFrom` after the balances have been updated.
     * This function MUST return `bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))` (i.e. 0xbc197c81) if it accepts the transfer(s).
     * This function MUST revert if it rejects the transfer(s).
     * Return of any other value than the prescribed keccak256 generated value MUST result in the transaction being reverted by the caller.
     * param _operator  The address which initiated the batch transfer (i.e. msg.sender)
     * param _from      The address which previously owned the token
     * param _ids       An array containing ids of each token being transferred (order and length must match _values array)
     * param _values    An array containing amounts of each token being transferred (order and length must match _ids array)
     * param _data      Additional data with no specified format
     * @return           `bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))`
     */
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns(bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    /**
     *  ERC777
     */

    /// @dev Notify a send or mint (if from is 0x0) of amount tokens from the from address to the
    ///      to address by the operator address.
    /// param operator Address which triggered the balance increase (through sending or minting).
    /// param from Holder whose tokens were sent (or 0x0 for a mint).
    /// param to Recipient of the tokens.
    /// param amount Number of tokens the recipient balance is increased by.
    /// param data Information provided by the holder.
    /// param operatorData Information provided by the operator.
    function tokensReceived(
        address,
        address,
        address,
        uint256,
        bytes calldata,
        bytes calldata
    ) external { }

    /**
     *  ERC1820
     */

    /// @dev Indicates whether the contract implements the interface `interfaceHash` for the address `addr` or not.
    /// @param interfaceHash keccak256 hash of the name of the interface
    /// @param addr Address for which the contract will implement the interface
    /// @return ERC1820_ACCEPT_MAGIC only if the contract implements `interfaceHash` for the address `addr`.
    function canImplementInterfaceForAddress(bytes32 interfaceHash, address addr) external view returns(bytes32) {
        if (interfaceHash == TOKENS_RECIPIENT_INTERFACE_HASH && addr == address(this)) {
            return ERC1820_ACCEPT_MAGIC;
        }
    }
}