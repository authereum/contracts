pragma solidity 0.5.8;

contract IERC1271 {
  function isValidSignature(
    bytes memory _messageHash,
    bytes memory _signature)
    public
    view
    returns (bytes4 magicValue);
}