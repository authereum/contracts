pragma solidity 0.5.17;

import "./AccountInitializeV1.sol";
import "./AccountInitializeV2.sol";
import "./AccountInitializeV3.sol";

/**
 * @title AccountInitialize
 * @author Authereum Labs, Inc.
 * @dev This contract holds the initialize functions used by the account contracts.
 * @dev This exists as the main contract to hold these functions. This contract is inherited
 * @dev by AuthereumAccount.sol, which will not care about initialization functions as long as it inherits
 * @dev AccountInitialize.sol. Any initialization function additions will be made to the various
 * @dev versions of AccountInitializeVx that this contract will inherit.
 */

contract AccountInitialize is AccountInitializeV1, AccountInitializeV2, AccountInitializeV3 {}