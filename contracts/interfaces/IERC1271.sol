pragma solidity 0.5.17;

contract IERC1271 {
    function isValidSignature(
        bytes32 _messageHash,
        bytes memory _signature
    ) public view returns (bytes4 magicValue);

    function isValidSignature(
        bytes memory _data,
        bytes memory _signature
    ) public view returns (bytes4 magicValue);
}