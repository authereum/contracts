const { expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactParseCallData = artifacts.require('ParseCallData')

contract('ParseCallData', function (accounts) {
  const OWNER = accounts[0]
  const ENS_OWNER = accounts[8]

  // Test Params
  let snapshotId

  // Instances
  let parseCallDataInstance

  before(async () => {
    parseCallDataInstance = await ArtifactParseCallData.new()
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('Happy Path', () => {
    it('Should correctly parse arbitrary data', async () => {
      const _parameterCount = 2
      const _addr = OWNER
      const _num = 123
      const _data = web3.eth.abi.encodeFunctionCall({
          name: 'testFunction',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addr'
          },{
              type: 'uint256',
              name: '_num'
          }]
        }, [_addr, _num])

      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0x5d0da2cf'
      const _expectedFunctionParams = [
        await web3.eth.abi.encodeParameter('address', _addr),
        await web3.eth.abi.encodeParameter('uint256', _num)
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
    it('Should correctly parse arbitrary data with both static and dynamic data', async () => {
      const _parameterCount = 6
      const _addrOne = OWNER
      const _numOne = 123
      const _nameOne = 'shane'
      const _numTwo = 456
      const _nameTwo = utils.stringToBytes('abc')
      const _addrTwo = ENS_OWNER

      const _data = web3.eth.abi.encodeFunctionCall({
          name: 'testFunction',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addrOne'
          },{
              type: 'uint256',
              name: '_numOne'
          },{
              type: 'string',
              name: '_nameOne'
          },{
              type: 'uint256',
              name: '_numTwo'
          },{
              type: 'bytes',
              name: '_nameTwo'
          },{
              type: 'address',
              name: '_addrTwo'
          }]
        }, [_addrOne, _numOne, _nameOne, _numTwo, _nameTwo, _addrTwo])

      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0x11f716c9'
      const _expectedFunctionParams = [
        await web3.eth.abi.encodeParameter('address', _addrOne),
        await web3.eth.abi.encodeParameter('uint256', _numOne),
        await web3.eth.abi.encodeParameter('string', _nameOne),
        await web3.eth.abi.encodeParameter('uint256', _numTwo),
        await web3.eth.abi.encodeParameter('bytes', _nameTwo),
        await web3.eth.abi.encodeParameter('address', _addrTwo)
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
    it('Should correctly parse data for a token transfer', async () => {
      const _parameterCount = 2
      const _to = OWNER
      const _value = 123
      const _data = web3.eth.abi.encodeFunctionCall({
          name: 'transfer',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_to'
          },{
              type: 'uint256',
              name: '_value'
          }]
        }, [_to, _value])

      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0xa9059cbb'
      const _expectedFunctionParams = [
        await web3.eth.abi.encodeParameter('address', _to),
        await web3.eth.abi.encodeParameter('uint256', _value)
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
    it('Should correctly parse data for a uniswap transfer (tokenToEthSwapInput)', async () => {
      const _parameterCount = 2
      const _tokensSold = 1000000000000
      const _minEth = 1000000
      const _deadline = 123
      const _data = web3.eth.abi.encodeFunctionCall({
          name: 'tokenToEthSwapInput',
          type: 'function',
          inputs: [{
              type: 'uint256',
              name: '_tokensSold'
          },{
              type: 'uint256',
              name: '_minEth'
          },{
              type: 'uint256',
              name: '_deadline'

          }]
        }, [_tokensSold, _minEth, _deadline])

      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0x95e3c50b'
      const _expectedFunctionParams = [
        await web3.eth.abi.encodeParameter('uint256', _tokensSold),
        await web3.eth.abi.encodeParameter('uint256', _minEth),
        await web3.eth.abi.encodeParameter('uint256', _deadline)
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
    it('Should correctly parse data for an empty function selector', async () => {
      // NOTE: This case is handled in our contracts by a different function.
      // The _parseCallData function cannot ever receive a fallback, so this
      // test is invalid
    })
  })
  describe('Non-happy Path', () => {
    it('Should not allow data to be too short', async () => {
      const _parameterCount = 2
      const _addr = OWNER
      const _num = 123
      let _data = web3.eth.abi.encodeFunctionCall({
          name: 'testFunction',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addr'
          },{
              type: 'uint256',
              name: '_num'
          }]
        }, [_addr, _num])

      _data = _data.substring(0, _data.length - 2)
      await expectRevert(parseCallDataInstance.callParseCalldata(_data, _parameterCount), constants.REVERT_MSG.DKM_TRANSACTION_DATA_TOO_SHORT)
    })
    it('Should allow data to be too long (1 byte)', async () => {
      const _parameterCount = 2
      const _addr = OWNER
      const _num = 123
      let _data = web3.eth.abi.encodeFunctionCall({
          name: 'testFunction',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addr'
          },{
              type: 'uint256',
              name: '_num'
          }]
        }, [_addr, _num])

      _data = _data + 'a'
      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0x05d0da2c'

      // NOTE: Because of the odd-length data, everything gets shifted right
      // Because of this, we will insert custom data in the expected data
      const _expectedFunctionParams = [
        '0xf00000000000000000000000090f8bf6a479f320ead074411a4b0e7944ea8c9c',
        '0x1000000000000000000000000000000000000000000000000000000000000007'
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
    it('Should allow data to be too long (2 bytes)', async () => {
      const _parameterCount = 2
      const _addr = OWNER
      const _num = 123
      let _data = web3.eth.abi.encodeFunctionCall({
          name: 'testFunction',
          type: 'function',
          inputs: [{
              type: 'address',
              name: '_addr'
          },{
              type: 'uint256',
              name: '_num'
          }]
        }, [_addr, _num])

      _data = _data + 'ab'
      const _parsedData = await parseCallDataInstance.callParseCalldata(_data, _parameterCount)

      const _expectedFunctionSig = '0x5d0da2cf'
      const _expectedFunctionParams = [
        await web3.eth.abi.encodeParameter('address', _addr),
        await web3.eth.abi.encodeParameter('uint256', _num)
      ]

      expectData(_parsedData, _expectedFunctionSig, _expectedFunctionParams)
    })
  })

  function expectData(parsedData, functionSig, functionParams) {
    const parsedFunctionSig = parsedData[0]
    const parsedParams = parsedData[1]

    assert.equal(parsedFunctionSig, functionSig)

    for (let i = 0; i < parsedParams.length; i++) {
      if (functionParams[i].length > 66) continue
      assert.equal(parsedParams[i], functionParams[i])
    }
  }
})
