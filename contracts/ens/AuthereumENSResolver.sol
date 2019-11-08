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

import "../base/Owned.sol";
import "../base/Managed.sol";
import "./ENS.sol";

/**
 * @title AuthereumEnsResolver
 * @author Julien Niset - <julien@argent.im>
 * @dev Authereum implementation of a Resolver.
 */

contract AuthereumEnsResolver is Owned, Managed {

    bytes4 constant INTERFACE_META_ID = 0x01ffc9a7;
    bytes4 constant ADDR_INTERFACE_ID = 0x3b3b57de;
    bytes4 constant NAME_INTERFACE_ID = 0x691f3431;

    event AddrChanged(bytes32 indexed node, address a);
    event NameChanged(bytes32 indexed node, string name);

    struct Record {
        address addr;
        string name;
    }

    EnsRegistry ens;
    mapping (bytes32 => Record) records;
    address public authereumEnsManager;
    address public timelockContract;

    /// @dev Constructor
    /// @param ensAddr The ENS registrar contract.
    /// @param _timelockContract Authereum timelock contract address
    constructor(EnsRegistry ensAddr, address _timelockContract) public {
        ens = ensAddr;
        timelockContract = _timelockContract;
    }

    /**
     * Setters
     */

    /// @dev Sets the address associated with an ENS node.
    /// @notice May only be called by the owner of that node in the ENS registry.
    /// @param node The node to update.
    /// @param addr The address to set.
    function setAddr(bytes32 node, address addr) public onlyManager {
        records[node].addr = addr;
        emit AddrChanged(node, addr);
    }

    /// @dev Sets the name associated with an ENS node, for reverse records.
    /// @notice May only be called by the owner of that node in the ENS registry.
    /// @param node The node to update.
    /// @param name The name to set.
    function setName(bytes32 node, string memory name) public onlyManager {
        records[node].name = name;
        emit NameChanged(node, name);
    }

    /**
     * Getters
     */

    /// @dev Returns the address associated with an ENS node.
    /// @param node The ENS node to query.
    /// @return The associated address.
    function addr(bytes32 node) public view returns (address) {
        return records[node].addr;
    }

    /// @dev Returns the name associated with an ENS node, for reverse records.
    /// @notice Defined in EIP181.
    /// @param node The ENS node to query.
    /// @return The associated name.
    function name(bytes32 node) public view returns (string memory) {
        return records[node].name;
    }

    /// @dev Returns true if the resolver implements the interface specified by the provided hash.
    /// @param interfaceID The ID of the interface to check for.
    /// @return True if the contract implements the requested interface.
    function supportsInterface(bytes4 interfaceID) public pure returns (bool) {
        return interfaceID == INTERFACE_META_ID ||
        interfaceID == ADDR_INTERFACE_ID ||
        interfaceID == NAME_INTERFACE_ID;
    }
}
