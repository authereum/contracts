pragma solidity 0.5.16;

import "./AuthereumEnsResolverStateV1.sol";

/**
 * @title AuthereumEnsResolverState
 * @author Authereum Labs, Inc.
 * @dev This contract holds the state variables used by the Authereum ENS Resolver.
 * @dev This exists as the main contract to hold state. This contract is inherited
 * @dev by AuthereumEnsResolver.sol, which will not care about state as long as it inherits
 * @dev AuthereumEnsResolverState.sol. Any state variable additions will be made to the various
 * @dev versions of AuthereumEnsResolverStateVX that this contract will inherit.
 */

contract AuthereumEnsResolverState is AuthereumEnsResolverStateV1 {}