pragma solidity 0.5.16;

import "../interfaces/IERC721Receiver.sol";
import "../interfaces/IERC1155TokenReceiver.sol";

contract TokenReceiverHooks is IERC721Receiver, IERC1155TokenReceiver {

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

}