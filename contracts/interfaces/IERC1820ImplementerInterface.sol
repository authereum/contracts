pragma solidity 0.5.17;

interface IERC1820ImplementerInterface {
    /// @notice Indicates whether the contract implements the interface `interfaceHash` for the address `addr` or not.
    /// @param interfaceHash keccak256 hash of the name of the interface
    /// @param addr Address for which the contract will implement the interface
    /// @return ERC1820_ACCEPT_MAGIC only if the contract implements `interfaceHash` for the address `addr`.
    function canImplementInterfaceForAddress(bytes32 interfaceHash, address addr) external view returns(bytes32);
}
