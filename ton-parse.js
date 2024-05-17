/* eslint-disable no-undef */
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const TonWeb = require('tonweb');
const { parseAddress } = require('tonweb/src/contract/token/nft/NftUtils');

const app = new Koa();
const router = new Router();

function withResponseBody() {
  return async (ctx, next) => {
    if (!ctx.json || typeof ctx.json !== 'function') {
      ctx.json = function ({ code, data }) {
        ctx.body = {
          code: code || 200,
          data: data,
          success: true,
        };
        return ctx.body;
      };
    }
    await next();
  };
}

router.post('/getAddressBocBase64', async (ctx) => {
  const { ownerWalletAddress } = ctx.request.body;
  const cell = new TonWeb.boc.Cell();
  cell.bits.writeAddress(new TonWeb.utils.Address(ownerWalletAddress));
  const result = TonWeb.utils.bytesToBase64(await cell.toBoc(false));
  return ctx.json({
    data: result,
  });
});

router.post('/parseBocHexAddress', async (ctx) => {
  const { bocHex } = ctx.request.body;
  const resCell = TonWeb.boc.Cell.oneFromBoc(
    new Uint8Array(Buffer.from(bocHex, 'hex')),
  );
  const result = parseAddress(resCell)?.toString(true, true, true, false);
  return ctx.json({
    data: result,
  });
});

router.post('/parsePayloadHex', async (ctx) => {
  const { bocHex } = ctx.request.body;
  const msgCell = TonWeb.boc.Cell.oneFromBoc(
    new Uint8Array(Buffer.from(bocHex, 'hex')),
  );
  const slice = msgCell.beginParse();
  const op = slice.loadUint(32);
  const queryId = slice.loadUint(64);
  const amount = slice.loadCoins();
  const address = slice.loadAddress();
  const maybeRef = slice.loadBit();

  const payload = slice.loadBits(slice.getFreeBits());
  let comment = undefined;
  if (payload.length > 0) {
    const payloadBytes = new Uint8Array(
      Buffer.from(Buffer.from(payload).toString('hex').substring(8), 'hex'),
    );
    comment = new TextDecoder().decode(payloadBytes);
  }

  let refComment = undefined;
  if (maybeRef) {
    const payload = maybeRef ? slice.loadRef() : slice;
    if (payload) {
      const payloadOp = payload.loadUint(32);
      if (payloadOp.eq(new TonWeb.utils.BN(0))) {
        const payloadBytes = new Uint8Array(
          Buffer.from(
            Buffer.from(payload.array).toString('hex').substring(8),
            'hex',
          ),
        ); // payload.loadBits(slice.getFreeBits());
        refComment = new TextDecoder().decode(payloadBytes);
      }
    }
  }

  return ctx.json({
    data: {
      op: op,
      queryId: queryId.toString(),
      amount: amount.toString(),
      address: address.toString(true, true, true, false),
      comment: comment,
      refComment: refComment,
    },
  });
});

router.get('/hello', async (ctx) => {
  ctx.body = 'hello';
});

app.use(
  bodyParser({
    fromLimit: '10mb',
    jsonLimit: '10mb',
  }),
);
app.use(withResponseBody());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 8088;
app.listen(PORT, () => {
  console.log(`Ton parse server is running on port ${PORT}`);
});

module.exports = app;
