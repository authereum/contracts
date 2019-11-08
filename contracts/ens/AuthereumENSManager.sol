/*
       Copyright (C) 2018 Argent Ltd. <https://argent.xyz>

        This program is free software: you can redistribute it and/or modify
        it under the terms of the GNU General Public License as published by
        the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version.

        This program is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
        GNU General Public License for more details.

        You should have received a copy of the GNU General Public License
        along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

pragma solidity ^0.5.8;

import "./ENS.sol";
import "../utils/strings.sol";
import "../base/Managed.sol";

contract AuthereumEnsResolver{
    function addManager(address _manager) external {}
    function setAddr(bytes32 node, address addr) external {}
    function setName(bytes32 node, string calldata name) external {}
    function addr(bytes32 node) external returns (address) {}
}

/**
 * @title AuthereumEnsManager
 * @author Julien Niset - <julien@argent.im>
 * @dev Used to manage all subdomains.
 * @dev This is also known as the Authereum registrar.
 * @dev The public ENS registry is used. The resolver is custom.
 */

contract AuthereumEnsManager {
    using strings for *;
    // namehash('addr.reverse')
    bytes32 constant public ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
    address ensRegistry;

    // The managed root name
    string public rootName;
    // The managed root node
    bytes32 public rootNode;
    // The address of the authereumEnsResolver
    address public authereumEnsResolver;

    event RootnodeOwnerChanged(bytes32 indexed rootnode, address indexed newOwner);
    event RootnodeResolverChanged(bytes32 indexed rootnode, address indexed newResolver);
    event RootnodeTTLChanged(bytes32 indexed rootnode, uint64 indexed newTtl);
    event AuthereumEnsResolverChanged(address indexed addr);
    event Registered(address indexed owner, string ens);

    /// @dev Throws if the sender is not the owner.
    modifier onlyOwner {
        require(Owned(authereumEnsResolver).isOwner(msg.sender), "Must be owner");
        _;
    }

    /// @dev Constructor that sets the ENS root name and root node to manage
    /// @param _rootName The root name (e.g. authereum.eth)
    /// @param _rootNode The node of the root name (e.g. namehash(authereum.eth))
    /// @param _ensRegistry Custom ENS Registry address
    /// @param _authereumEnsResolver Custom Autheruem ENS Resolver address
    constructor(
        string memory _rootName,
        bytes32 _rootNode,
        address _ensRegistry,
        address _authereumEnsResolver
    )
        public
    {
        rootName = _rootName;
        rootNode = _rootNode;
        ensRegistry = _ensRegistry;
        authereumEnsResolver = _authereumEnsResolver;
    }

    /// @dev Resolves an ENS name to an address.
    /// @param _node The namehash of the ENS name.
    function resolveEns(bytes32 _node) public returns (address) {
        address resolver = getEnsRegistry().resolver(_node);
        return AuthereumEnsResolver(resolver).addr(_node);
    }

    /// @dev Gets the official ENS registry.
    function getEnsRegistry() public view returns (EnsRegistry) {
        return EnsRegistry(ensRegistry);
    }

    /// @dev Gets the official ENS reverse registrar.
    function getEnsReverseRegistrar() public view returns (EnsReverseRegistrar) {
        return EnsReverseRegistrar(getEnsRegistry().owner(ADDR_REVERSE_NODE));
    }

    /**
     *  External functions
     */

    /// @dev This function is used when the rootnode owner is updated
    /// @param _newOwner The address of the new ENS manager that will manage the root node.
    function changeRootnodeOwner(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Address cannot be null");
        getEnsRegistry().setOwner(rootNode, _newOwner);
        emit RootnodeOwnerChanged(rootNode, _newOwner);
    }

    /// @dev This function is used when the rootnode resolver is updated
    /// @param _newResolver The address of the new ENS Resolver that will manage the root node.
    function changeRootnodeResolver(address _newResolver) external onlyOwner {
        require(_newResolver != address(0), "Address cannot be null");
        getEnsRegistry().setResolver(rootNode, _newResolver);
        emit RootnodeResolverChanged(rootNode, _newResolver);
    }

    /// @dev This function is used when the rootnode TTL is updated
    /// @param _newTtl The address of the new TTL that will manage the root node.
    function changeRootnodeTTL(uint64 _newTtl) external onlyOwner {
        getEnsRegistry().setTTL(rootNode, _newTtl);
        emit RootnodeTTLChanged(rootNode, _newTtl);
    }

    /// @dev Lets the owner change the address of the Authereum ENS resolver contract
    /// @param _authereumEnsResolver The address of the Authereun ENS resolver contract
    function changeEnsResolver(address _authereumEnsResolver) external onlyOwner {
        require(_authereumEnsResolver != address(0), "Address cannot be null");
        authereumEnsResolver = _authereumEnsResolver;
        emit AuthereumEnsResolverChanged(_authereumEnsResolver);
    }

    /// @dev Lets the manager assign an ENS subdomain of the root node to a target address.
    ///      Registers both the forward and reverse ENS
    /// @param _label The subdomain label
    /// @param _owner The owner of the subdomain
    function register(string calldata _label, address _owner) external {
        bytes32 labelNode = keccak256(abi.encodePacked(_label));
        bytes32 node = keccak256(abi.encodePacked(rootNode, labelNode));
        address currentOwner = getEnsRegistry().owner(node);
        require(currentOwner == address(0), "Label is already owned");

        // Forward ENS
        getEnsRegistry().setSubnodeOwner(rootNode, labelNode, address(this));
        getEnsRegistry().setResolver(node, authereumEnsResolver);
        getEnsRegistry().setOwner(node, _owner);
        AuthereumEnsResolver(authereumEnsResolver).setAddr(node, _owner);

        // Reverse ENS
        strings.slice[] memory parts = new strings.slice[](2);
        parts[0] = _label.toSlice();
        parts[1] = rootName.toSlice();
        string memory name = ".".toSlice().join(parts);
        bytes32 reverseNode = EnsReverseRegistrar(getEnsReverseRegistrar()).node(_owner);
        AuthereumEnsResolver(authereumEnsResolver).setName(reverseNode, name);

        emit Registered(_owner, name);
    }

    /**
     *  Public functions
     */

    /// @dev Returns true is a given subnode is available
    /// @param _subnode The target subnode
    /// @return true if the subnode is available
    function isAvailable(bytes32 _subnode) public view returns (bool) {
        bytes32 node = keccak256(abi.encodePacked(rootNode, _subnode));
        address currentOwner = getEnsRegistry().owner(node);
        if(currentOwner == address(0)) {
            return true;
        }
        return false;
    }
}