pragma solidity 0.5.16;

contract IERC1271 {
    function isValidSignature(
        bytes memory _data,
        bytes memory _signature
    ) public view returns (bytes4 magicValue);
}