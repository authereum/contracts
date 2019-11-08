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

import "./Owned.sol";

/**
 * @title Managed
 * @author Julien Niset - <julien@argent.im>
 * @dev Basic contract that defines a set of managers. Only the owner can add/remove managers.
 */

contract Managed is Owned {

    // The managers
    mapping (address => bool) public managers;

    /// @dev Throws if the sender is not a manager.
    modifier onlyManager {
        require(managers[msg.sender] == true, "Must be manager");
        _;
    }

    event ManagerAdded(address indexed _manager);
    event ManagerRevoked(address indexed _manager);

    /// @dev Adds a manager.
    /// @param _manager The address of the manager.
    function addManager(address _manager) external onlyOwner {
        require(_manager != address(0), "Address must not be null");
        if(managers[_manager] == false) {
            managers[_manager] = true;
            emit ManagerAdded(_manager);
        }
    }

    /// @dev Revokes a manager.
    /// @param _manager The address of the manager.
    function revokeManager(address _manager) external onlyOwner {
        require(managers[_manager] == true, "Target must be an existing manager");
        delete managers[_manager];
        emit ManagerRevoked(_manager);
    }
}