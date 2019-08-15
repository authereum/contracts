import AuthereumContracts from './'

test('rinkeby - getCreate2Address', async () => {
  let authKeyAddress = '0x461bc9541c27aAdFf85a9B4733C06E94988aA863'
  let publicEnsRegistryAddress = '0xcC7d7F62826D5080af12B9cc9865240Efbd130A4'
  let label = 'abc123'
  let salt = 1115
  let from = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'
  let network = 'rinkeby'

  AuthereumContracts.setConfig({
    logicAddress: '0xC44cCbF4FD5dCF8A440a9853B711c9E45036c678',
    networkName: 'rinkeby'
  })

  let address = await AuthereumContracts.getCreate2Address(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  expect(address).toBe('0xf407977D23eeb4263ba1C670A5B49a63AC3F9b7b')
})

test('rinkeby - deployAccount', async () => {
  let authKeyAddress = '0x461bc9541c27aAdFf85a9B4733C06E94988aA863'
  let publicEnsRegistryAddress = '0xcC7d7F62826D5080af12B9cc9865240Efbd130A4'
  let label = 'abc123' + Date.now()
  let salt = Date.now()
  let from = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'
  let network = 'rinkeby'

  AuthereumContracts.setConfig({
    logicAddress: '0xC44cCbF4FD5dCF8A440a9853B711c9E45036c678',
    networkName: 'rinkeby'
  })
  let computedAddress = await AuthereumContracts.getCreate2Address(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  let address = await AuthereumContracts.deployAccount(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  expect(address).toEqual(computedAddress)
}, 20e3)

test('kovan - getCreate2Address', async () => {
  let authKeyAddress = '0x461bc9541c27aAdFf85a9B4733C06E94988aA863'
  let publicEnsRegistryAddress = '0x8016194885195C4eD3ff553D52F7234654FF098C'
  let label = 'abc123'
  let salt = 1115
  let from = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'
  let network = 'kovan'

  AuthereumContracts.setConfig({
    logicAddress: '0x12309A2DeEd6F17fECFDD816A2F5D32dF577E4bB',
    networkName: 'kovan'

  })

  let address = await AuthereumContracts.getCreate2Address(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  expect(address).toBe('0xf142339a13b1926f3FB5Ee9aD3929221594e9AD7')
})

test('kovan - deployAccount', async () => {
  let authKeyAddress = '0x461bc9541c27aAdFf85a9B4733C06E94988aA863'
  let publicEnsRegistryAddress = '0x8016194885195C4eD3ff553D52F7234654FF098C'
  let label = 'abc123' + Date.now()
  let salt = Date.now()
  let from = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'
  let network = 'kovan'

  AuthereumContracts.setConfig({
    logicAddress: '0x12309A2DeEd6F17fECFDD816A2F5D32dF577E4bB',
    networkName: 'kovan'
  })

  let computedAddress = await AuthereumContracts.getCreate2Address(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  let address = await AuthereumContracts.deployAccount(
    authKeyAddress,
    publicEnsRegistryAddress,
    label,
    salt,
    network,
    from
  )

  expect(address).toEqual(computedAddress)
}, 20e3)
