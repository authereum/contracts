pragma solidity 0.5.16;

import "./AccountStateV1.sol";

/**
 * @title AccountState
 * @author Authereum Labs, Inc.
 * @dev This contract holds the state variables used by the account contracts.
 * @dev This exists as the main contract to hold state. This contract is inherited
 * @dev by Account.sol, which will not care about state as long as it inherits
 * @dev AccountState.sol. Any state variable additions will be made to the various
 * @dev versions of AccountStateVX that this contract will inherit.
 */

contract AccountState is AccountStateV1 {}