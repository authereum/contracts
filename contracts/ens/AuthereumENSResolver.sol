pragma solidity 0.5.16;

import "../base/Managed.sol";
import "./state/AuthereumEnsResolverState.sol";

/**
 * @title AuthereumEnsResolver
  * @author Authereum Labs, Inc.
 * @dev Authereum implementation of a Resolver.
 */

contract AuthereumEnsResolver is Managed, AuthereumEnsResolverState {

    string constant public authereumEnsResolverVersion = "2019111500";

    bytes4 constant private INTERFACE_META_ID = 0x01ffc9a7;
    bytes4 constant private ADDR_INTERFACE_ID = 0x3b3b57de;
    bytes4 constant private NAME_INTERFACE_ID = 0x691f3431;
    bytes4 constant private TEXT_INTERFACE_ID = 0x59d1d43c;
    bytes4 constant private CONTENT_HASH_INTERFACE_ID = 0xbc1c58d1;

    event AddrChanged(bytes32 indexed node, address a);
    event NameChanged(bytes32 indexed node, string name);
    event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes hash);

    /// @dev Constructor
    /// @param _ensAddr The ENS registrar contract
    /// @param _timelockContract Authereum timelock contract address
    constructor(EnsRegistry _ensAddr, address _timelockContract) public {
        ens = _ensAddr;
        timelockContract = _timelockContract;
    }

    /**
     * Setters
     */

    /// @dev Sets the address associated with an ENS node
    /// @notice May only be called by the owner of that node in the ENS registry
    /// @param _node The node to update
    /// @param _addr The address to set
    function setAddr(bytes32 _node, address _addr) public onlyManager {
        addrs[_node]= _addr;
        emit AddrChanged(_node, _addr);
    }

    /// @dev Sets the name associated with an ENS node, for reverse records
    /// @notice May only be called by the owner of that node in the ENS registry
    /// @param _node The node to update
    /// @param _name The name to set
    function setName(bytes32 _node, string memory _name) public onlyManager {
        names[_node] = _name;
        emit NameChanged(_node, _name);
    }

    /// @dev Sets the text data associated with an ENS node and key
    /// @notice May only be called by the owner of that node in the ENS registry
    /// @param node The node to update
    /// @param key The key to set
    /// @param value The text data value to set
    function setText(bytes32 node, string memory key, string memory value) public onlyManager {
        texts[node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    /// @dev Sets the contenthash associated with an ENS node
    /// @notice May only be called by the owner of that node in the ENS registry
    /// @param node The node to update
    /// @param hash The contenthash to set
    function setContenthash(bytes32 node, bytes memory hash) public onlyManager {
        hashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    /**
     * Getters
     */

    /// @dev Returns the address associated with an ENS node
    /// @param _node The ENS node to query
    /// @return The associated address
    function addr(bytes32 _node) public view returns (address) {
        return addrs[_node];
    }

    /// @dev Returns the name associated with an ENS node, for reverse records
    /// @notice Defined in EIP181
    /// @param _node The ENS node to query
    /// @return The associated name
    function name(bytes32 _node) public view returns (string memory) {
        return names[_node];
    }

    /// @dev Returns the text data associated with an ENS node and key
    /// @param node The ENS node to query
    /// @param key The text data key to query
    ///@return The associated text data
    function text(bytes32 node, string memory key) public view returns (string memory) {
        return texts[node][key];
    }

    /// @dev Returns the contenthash associated with an ENS node
    /// @param node The ENS node to query
    /// @return The associated contenthash
    function contenthash(bytes32 node) public view returns (bytes memory) {
        return hashes[node];
    }

    /// @dev Returns true if the resolver implements the interface specified by the provided hash
    /// @param _interfaceID The ID of the interface to check for
    /// @return True if the contract implements the requested interface
    function supportsInterface(bytes4 _interfaceID) public pure returns (bool) {
        return _interfaceID == INTERFACE_META_ID ||
        _interfaceID == ADDR_INTERFACE_ID ||
        _interfaceID == NAME_INTERFACE_ID ||
        _interfaceID == TEXT_INTERFACE_ID ||
        _interfaceID == CONTENT_HASH_INTERFACE_ID;
    }
}
