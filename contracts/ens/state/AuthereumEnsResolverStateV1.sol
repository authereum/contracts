pragma solidity 0.5.16;

import "../../test/EnsReverseRegistrar.sol";

/**
 * @title AuthereumEnsResolverStateV1
 * @author Authereum Labs, Inc.
 * @dev This contract holds the state variables used by the Authereum ENS Resolver.
 * @dev This abscraction exists in order to retain the order of the state variables.
 */

contract AuthereumEnsResolverStateV1 {

    EnsRegistry ens;
    address public timelockContract;

    mapping (bytes32 => address) public addrs;
    mapping(bytes32 => string) public names;
    mapping(bytes32 => mapping(string => string)) public texts;
    mapping(bytes32 => bytes) public hashes;
}