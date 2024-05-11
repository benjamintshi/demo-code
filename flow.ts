import { encodeTransactionEnvelope } from "./encode";
import { sansPrefix } from "@onflow/util-address";
import { sha3_256 } from "js-sha3";
import { ecdsaSign } from "secp256k1";
import * as sdk from "@onflow/sdk";
import * as types from "@onflow/types";
import utils from "./index";

const tTransferFlow = (network: FlowNetwork) => {
 return `
import FungibleToken from ${fungibleToken}
import FlowToken from ${flowToken}

transaction(amount: UFix64, to: Address) {
 let sentVault: @FungibleToken.Vault

 prepare(signer: AuthAccount) {
   let vaultRef = signer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
     ?? panic("Could not borrow reference to the owner''s Vault!")

   self.sentVault <- vaultRef.withdraw(amount: amount)
 }

 execute {
   let recipient = getAccount(to)

   let receiverRef = recipient.getCapability(/public/flowTokenReceiver).borrow<&{FungibleToken.Receiver}>()
     ?? panic("Could not borrow receiver reference to the recipient''s Vault")

   receiverRef.deposit(from: <-self.sentVault)
 }
}
`
}

function signTransaction(): string {
   const seriesData: FlowTxSeriesData = txObj;
   // https://docs.onflow.org/cadence/json-cadence-spec/#fixed-point-numbers
   let amount = seriesData.amount;
   if (amount.toString().indexOf(".") === -1) {
       amount = amount + ".0";
   }
   const arg1: ScriptArg = sdk.arg(amount, types.UFix64);
   const arg2: ScriptArg = sdk.arg(toAddress, types.Address);
   const proposer: Proposer = {
       address: seriesData.from,
       keyId: 0,
       sequenceNum: seriesData.sequenceNum,
       privKey: privs[0].key,
   };
   const param = {
       script: tTransferFlow(FlowNetwork[`${chain}_${network}`]),
       args: [arg1, arg2],
       payer: seriesData.from,
       proposer: proposer,
       authorizers: [seriesData.from],
       gasLimit: seriesData.gasLimit,
       refBlock: seriesData.refBlock,
   }
   return createTransaction(param);
}
interface ScriptArg {
   value: any
   xform: any
}
interface Proposer {
   address: string
   keyId: number
   sequenceNum: number
   privKey: string | ArrayLike<number>
}
const argumentToString = arg => Buffer.from(JSON.stringify(arg), "utf8");
interface txParam {
   script: string;
   args: ScriptArg[];
   payer: string;
   proposer: Proposer;
   authorizers: string[];
   gasLimit: number;
   refBlock: string;
}
// flow-js-sdk/packages/sdk/src/resolve/resolve-signatures.js: function resolveSignatures(ix)
function createTransaction(param: txParam) {
   const message = {
       cadence: param.script,
       refBlock: param.refBlock,
       computeLimit: param.gasLimit,
       arguments: param.args.map(arg => arg.xform.asArgument(arg.value)),
       proposalKey: {
           address: sansPrefix(param.proposer.address),
           keyId: param.proposer.keyId,
           sequenceNum: param.proposer.sequenceNum,
       },
       payer: sansPrefix(param.payer),
       authorizers: param.authorizers.map(sansPrefix),
       payloadSigs: [],
   }
   const signature: any = sign(param.proposer.privKey, message);
   // Apply Signatures to Payload
   message["envelopeSigs"] = [{
       address: sansPrefix(param.proposer.address),
       keyId: param.proposer.keyId,
       signature: utils.byteArray2hexStr(signature),
   }];

   message["arguments"] = message.arguments.map(argumentToString);
   return JSON.stringify(message);
}

function sign(privKey: string | ArrayLike<number>, txMsg: Object) {
   var privKeyBytes;
   try {
       if (typeof privKey === "string") {
           privKeyBytes = new Uint8Array(utils.hexStr2byteArray(privKey));
       } else {
           privKeyBytes = new Uint8Array(privKey);
       }
   } catch {
       throw new Error(``);
   }
   const msg = new Uint8Array(utils.hexStr2byteArray(encodeTransactionEnvelope(txMsg)));
   const msgHash = new Uint8Array(utils.hexStr2byteArray(sha3_256(msg)));
   const sig = ecdsaSign(msgHash, privKeyBytes);
   return sig.signature;
}
