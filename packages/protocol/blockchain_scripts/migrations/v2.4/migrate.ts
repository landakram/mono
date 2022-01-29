import {CommunityRewards, GFI} from "@goldfinch-eng/protocol/typechain/ethers"
import {CommunityRewardsInstance} from "@goldfinch-eng/protocol/typechain/truffle"
import {GFIInstance} from "@goldfinch-eng/protocol/typechain/truffle/GFI"
import hre from "hardhat"
import path from "path"
import {promises as fs} from "fs"
import {deployMerkleDirectDistributor} from "../../baseDeploy/deployMerkleDirectDistributor"
import {deployMerkleDistributor} from "../../baseDeploy/deployMerkleDistributor"
import {ContractDeployer, getEthersContract, getTruffleContract} from "../../deployHelpers"
import {getDeployEffects} from "../deployEffects"
import {isMerkleDistributorInfo} from "../../merkle/merkleDistributor/types"
import {assertNonNullable} from "@goldfinch-eng/utils"
import {isMerkleDirectDistributorInfo} from "../../merkle/merkleDirectDistributor/types"
import {BigNumber} from "ethers"

export const merkleDistributorInfoPath = path.join(
  __dirname,
  "../../merkle/merkleDistributor/2022-01-24-backers-airdrop-merkleDistributorInfo.json"
)
export const merkleDirectDistributorInfoPath = path.join(
  __dirname,
  "../../merkle/merkleDirectDistributor/2022-01-24-backers-airdrop-merkleDirectDistributorInfo.json"
)

export const grantAddress1 = "0x379ED372c94CAe8B77dceb9987D7D6A04A31685D"
export const grantAddress2 = "0xddbd3514F1cf38E1cdd332746B70c7325fbCcd04"

export async function main() {
  const deployEffects = await getDeployEffects({
    title: "Backer airdrop",
    description: "https://gov.goldfinch.finance/t/retroactive-backer-distribution-proposal-3-with-data/252",
  })

  const deployer = new ContractDeployer(console.log, hre)

  console.log("Starting deployment")

  const communityRewardsContract = await getTruffleContract<CommunityRewardsInstance>("CommunityRewards")
  const communityRewards = {name: "CommunityRewards", contract: communityRewardsContract}
  const gfiContract = await getTruffleContract<GFIInstance>("GFI")
  const gfi = {name: "GFI", contract: gfiContract}

  console.log("Deploying merkle distributors")

  const merkleDistributorInfo = JSON.parse(String(await fs.readFile(merkleDistributorInfoPath)))
  if (!isMerkleDistributorInfo(merkleDistributorInfo)) {
    throw new Error("Invalid merkle distributor info")
  }
  const merkleDirectDistributorInfo = JSON.parse(String(await fs.readFile(merkleDirectDistributorInfoPath)))
  if (!isMerkleDirectDistributorInfo(merkleDirectDistributorInfo)) {
    throw new Error("Invalid merkle direct distributor info")
  }

  const merkleDistributor = await deployMerkleDistributor(deployer, {
    contractName: "BackerMerkleDistributor",
    communityRewards,
    deployEffects,
    merkleDistributorInfoPath,
  })
  assertNonNullable(merkleDistributor, "BackerMerkleDistributor is null")
  const merkleDirectDistributor = await deployMerkleDirectDistributor(deployer, {
    contractName: "BackerMerkleDirectDistributor",
    gfi,
    deployEffects,
    merkleDirectDistributorInfoPath,
  })
  assertNonNullable(merkleDirectDistributor, "BackerMerkleDirectDistributor is null")

  console.log("Loading rewards")

  const merkleDistributorAmount = web3.utils.toBN(merkleDistributorInfo.amountTotal)
  const merkleDirectDistributorAmount = web3.utils.toBN(merkleDirectDistributorInfo.amountTotal)

  const communityRewardsEthersContract = await getEthersContract<CommunityRewards>("CommunityRewards")
  const gfiEthersContract = await getEthersContract<GFI>("GFI")

  // A 550 GFI grant is specified as part of the governance proposal.
  // This grant is to be split among the two developers who contributed to the backer airdrop calculation
  const grantAmount = BigNumber.from(String(550e18)).div(2)

  deployEffects.add({
    deferred: [
      await gfiEthersContract.populateTransaction.approve(
        communityRewardsEthersContract.address,
        merkleDistributorAmount.toString()
      ),
      await communityRewardsEthersContract.populateTransaction.loadRewards(merkleDistributorAmount.toString()),
      await gfiEthersContract.populateTransaction.approve(
        merkleDirectDistributor.contract.address,
        merkleDirectDistributorAmount.toString()
      ),
      await gfiEthersContract.populateTransaction.transfer(
        merkleDirectDistributor.contract.address,
        merkleDirectDistributorAmount.toString()
      ),
      await gfiEthersContract.populateTransaction.transfer(grantAddress1, grantAmount),
      await gfiEthersContract.populateTransaction.transfer(grantAddress2, grantAmount),
    ],
  })

  await deployEffects.executeDeferred()
  return {}
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
