pragma solidity 0.5.16;

import "../ens/AuthereumEnsResolver.sol";
import "../base/Owned.sol";

contract ResetManager is Owned {

    address ensRegistry;
    // The managed root node
    bytes32 public rootNode;

    event RootnodeOwnerChanged(bytes32 indexed rootnode, address indexed newOwner);

    /// @dev Constructor that sets the ENS root name and root node to manage
    /// @param _rootNode The node of the root name (e.g. namehash(authereum.eth))
    /// @param _ensRegistry Custom ENS Registry address
    constructor(
        bytes32 _rootNode,
        address _ensRegistry
    )
        public
    {
        rootNode = _rootNode;
        ensRegistry = _ensRegistry;
    }

    /// @dev This function is used when the rootnode owner is updated
    /// @param _newOwner The address of the new ENS manager that will manage the root node
    function changeRootnodeOwner(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "AEM: Address must not be null");
        getEnsRegistry().setOwner(rootNode, _newOwner);
        emit RootnodeOwnerChanged(rootNode, _newOwner);
    }

    /// @dev Gets the official ENS registry
    /// @return The official ENS registry address
    function getEnsRegistry() public view returns (EnsRegistry) {
        return EnsRegistry(ensRegistry);
    }

    function reset(
        string calldata _label
    )
        external
        onlyOwner
    {
        bytes32 labelNode = keccak256(abi.encodePacked(_label));
        bytes32 node = keccak256(abi.encodePacked(rootNode, labelNode));

        // Reset Official ENS Registry
        getEnsRegistry().setSubnodeOwner(rootNode, labelNode, address(this));
        getEnsRegistry().setResolver(node, address(0));  // TODO: Technically I think this doesn't matter
        getEnsRegistry().setOwner(node, address(0));
        getEnsRegistry().setSubnodeOwner(rootNode, labelNode, address(0));
    }
}