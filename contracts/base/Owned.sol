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

pragma solidity ^0.5.4;

/**
 * @title Owned
 * @author Julien Niset - <julien@argent.im>
 * @dev Basic contract to define an owner.
 */

contract Owned {

    // The owner
    address public owner;

    event OwnerChanged(address indexed _newOwner);

    /// @dev Throws if the sender is not the owner.
    modifier onlyOwner {
        require(msg.sender == owner, "Must be owner");
        _;
    }

    constructor() public {
        owner = msg.sender;
    }

    /// @dev Return the ownership status of an address.
    /// @param _potentialOwner Address being checked.
    function isOwner(address _potentialOwner) external view returns (bool) {
        return owner == _potentialOwner;
    }

    /// @dev Lets the owner transfer ownership of the contract to a new owner.
    /// @param _newOwner The new owner.
    function changeOwner(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Address must not be null");
        owner = _newOwner;
        emit OwnerChanged(_newOwner);
    }
}