import {
  BaseText,
  H7,
  H6,
  HeaderTitle,
  H2,
} from '../../../components/styled/Text';
import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import {RouteProp} from '@react-navigation/core';
import {WalletStackParamList} from '../WalletStack';
import {useAppDispatch, useLogger, useAppSelector} from '../../../utils/hooks';
import {
  buildTransactionDetails,
  getDetailsTitle,
  IsMultisigEthInfo,
  IsReceived,
  NotZeroAmountEVM,
  TxActions,
  RemoveTxProposal,
  RejectTxProposal,
} from '../../../store/wallet/effects/transactions/transactions';
import {createWalletAddress} from '../../../store/wallet/effects/address/address';
import styled, {useTheme} from 'styled-components/native';
import {
  Hr,
  ScreenGutter,
  SheetContainer,
  SheetParams,
} from '../../../components/styled/Containers';
import {IsCustomERCToken} from '../../../store/wallet/utils/currency';
import {TransactionIcons} from '../../../constants/TransactionIcons';
import Button from '../../../components/button/Button';
import MultipleOutputsTx from '../components/MultipleOutputsTx';
import {
  Black,
  Caution,
  LightBlack,
  NeutralSlate,
  SlateDark,
  Warning,
  White,
} from '../../../styles/colors';
import Banner from '../../../components/banner/Banner';
import Info from '../../../components/icons/info/Info';
import {GetAmFormatDate, GetAmTimeAgo} from '../../../store/wallet/utils/time';
import SendToPill from '../components/SendToPill';
import {SUPPORTED_CURRENCIES} from '../../../constants/currencies';
import {CurrencyListIcons} from '../../../constants/SupportedCurrencyOptions';
import DefaultSvg from '../../../../assets/img/currencies/default.svg';
import {
  showBottomNotificationModal,
  showOnGoingProcessModal,
} from '../../../store/app/app.actions';
import {startOnGoingProcessModal} from '../../../store/app/app.effects';
import {dismissOnGoingProcessModal} from '../../../store/app/app.actions';
import {
  broadcastTx,
  publishAndSign,
} from '../../../store/wallet/effects/send/send';
import {
  CustomErrorMessage,
  WrongPasswordError,
} from '../components/ErrorMessages';
import {BWCErrorMessage} from '../../../constants/BWCError';
import {BottomNotificationConfig} from '../../../components/modal/bottom-notification/BottomNotification';
import {
  startUpdateWalletStatus,
  waitForTargetAmountAndUpdateWallet,
} from '../../../store/wallet/effects/status/status';
import {useTranslation} from 'react-i18next';
import {findWalletById} from '../../../store/wallet/utils/wallet';
import {
  Key,
  TransactionProposal,
  Wallet,
} from '../../../store/wallet/wallet.models';
import {
  DetailColumn,
  DetailContainer,
  DetailRow,
  SendToPillContainer,
} from './send/confirm/Shared';
import {LogActions} from '../../../store/log';
import {GetPayProDetails} from '../../../store/wallet/effects/paypro/paypro';
import {AppActions} from '../../../store/app';
import DeleteIconWhite from '../../../../assets/img/delete-icon-white.svg';
import DeleteIcon from '../../../../assets/img/delete-icon.svg';
import RejectIcon from '../../../../assets/img/reject.svg';
import RejectIconWhite from '../../../../assets/img/close.svg';
import SheetModal from '../../../components/modal/base/sheet/SheetModal';
import Settings from '../../../components/settings/Settings';

const TxpDetailsContainer = styled.SafeAreaView`
  flex: 1;
`;

const ScrollView = styled.ScrollView`
  padding: 0 5px;
  margin-left: ${ScreenGutter};
`;

const SubTitle = styled(BaseText)`
  font-size: 14px;
  font-weight: 300;
`;

const TimelineContainer = styled.View`
  padding: 15px 0;
`;

const TimelineItem = styled.View`
  padding: 10px 0;
`;

const TimelineDescription = styled.View`
  margin: 0 10px;
`;

const TimelineBorderLeft = styled.View<{isFirst: boolean; isLast: boolean}>`
  background-color: ${({theme: {dark}}) => (dark ? LightBlack : NeutralSlate)};
  position: absolute;
  top: ${({isFirst}) => (isFirst ? '45px' : 0)};
  bottom: ${({isLast}) => (isLast ? '15px' : 0)};
  left: 18px;
  width: 1px;
  z-index: -1;
`;
const TimelineTime = styled(H7)`
  color: ${({theme: {dark}}) => (dark ? White : SlateDark)};
`;

const IconBackground = styled.View`
  height: 35px;
  width: 35px;
  border-radius: 50px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme: {dark}}) => (dark ? Black : White)};
`;

const NumberIcon = styled(IconBackground)`
  background-color: ${({theme: {dark}}) => (dark ? LightBlack : NeutralSlate)};
`;

const MemoMsgContainer = styled.View`
  margin: 20px 0;
  justify-content: flex-start;
`;

const MemoMsgText = styled(BaseText)`
  font-size: 16px;
  color: #9b9bab;
  margin-top: 10px;
  justify-content: flex-start;
`;

const ButtonContainer = styled.View`
  padding: 0 ${ScreenGutter};
  margin: 15px 0;
`;

const OptionContainer = styled.TouchableOpacity<SheetParams>`
  padding: 15px 5px;
  flex-direction: row;
  align-items: stretch;
  cursor: pointer;
`;

const OptionTextContainer = styled.View`
  align-items: flex-start;
  justify-content: space-around;
  flex-direction: column;
  margin: 0 20px;
`;

const OptionTitleText = styled(BaseText)<{isReject: boolean}>`
  font-style: normal;
  font-weight: 500;
  font-size: 14px;
  line-height: 19px;
  color: ${({isReject}) => (isReject ? Warning : Caution)};
`;

const OptionIconContainer = styled.View`
  justify-content: center;
  width: 20px;
`;

const TimelineList = ({actions}: {actions: TxActions[]}) => {
  return (
    <>
      {actions.map(
        (
          {type, time, description, by}: TxActions,
          index: number,
          {length}: {length: number},
        ) => {
          return (
            <DetailRow key={index}>
              <TimelineBorderLeft
                isFirst={index === 0}
                isLast={index === length - 1}
              />
              <TimelineItem>
                <DetailRow>
                  {type === 'rejected' ? (
                    <IconBackground>
                      <Info size={35} bgColor={Caution} />
                    </IconBackground>
                  ) : null}

                  {type === 'broadcasted' ? (
                    <IconBackground>
                      {TransactionIcons.broadcast}
                    </IconBackground>
                  ) : null}

                  {type !== 'broadcasted' && type !== 'rejected' ? (
                    <NumberIcon>
                      <H7>{length - index}</H7>
                    </NumberIcon>
                  ) : null}

                  <TimelineDescription>
                    <H7>{description}</H7>
                    {by ? <H7>{by}</H7> : null}
                  </TimelineDescription>
                </DetailRow>
              </TimelineItem>

              <TimelineTime>{GetAmTimeAgo(time * 1000)}</TimelineTime>
            </DetailRow>
          );
        },
      )}
    </>
  );
};

let countDown: NodeJS.Timer | undefined;

const TransactionProposalDetails = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const logger = useLogger();
  const navigation = useNavigation();
  const {
    params: {transactionId, walletId, keyId},
  } = useRoute<RouteProp<WalletStackParamList, 'TransactionProposalDetails'>>();
  const defaultAltCurrency = useAppSelector(({APP}) => APP.defaultAltCurrency);
  const key = useAppSelector(({WALLET}) => WALLET.keys[keyId]) as Key;
  const wallet = findWalletById(key.wallets, walletId) as Wallet;
  const transaction = wallet.pendingTxps.find(txp => txp.id === transactionId);
  const [txp, setTxp] = useState<any>();
  const [payProDetails, setPayProDetails] = useState<any>();
  const [paymentExpired, setPaymentExpired] = useState<boolean>(false);
  const [remainingTimeStr, setRemainingTimeStr] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [payproIsLoading, setPayproIsLoading] = useState(true);
  const [lastSigner, setLastSigner] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showRejectButton, setShowRejectButton] = useState(false);
  const [showRemoveButton, setShowRemoveButton] = useState(false);

  const title =
    getDetailsTitle(transaction, wallet) || t('Transaction Details');
  let {currencyAbbreviation, chain, network} = wallet;
  currencyAbbreviation = currencyAbbreviation.toLowerCase();
  const isTestnet = network === 'testnet';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle>{title}</HeaderTitle>,
      headerRight: () =>
        showRejectButton || showRemoveButton ? (
          <Settings onPress={() => setShowOptions(!showOptions)} />
        ) : null,
    });
  }, [navigation, title, showOptions, showRejectButton, showRemoveButton]);

  const init = async () => {
    try {
      if (!transaction) {
        navigation.goBack();
        return;
      }
      dispatch(showOnGoingProcessModal('LOADING'));
      const _transaction = await dispatch(
        buildTransactionDetails({
          transaction,
          wallet,
          defaultAltCurrencyIsoCode: defaultAltCurrency.isoCode,
        }),
      );
      setTxp(_transaction);
      setLastSigner(
        _transaction.actions.filter((a: any) => a?.type === 'accept').length ===
          _transaction.requiredSignatures - 1,
      );
      dispatch(dismissOnGoingProcessModal());
      setIsLoading(false);
    } catch (err) {
      dispatch(dismissOnGoingProcessModal());
      setIsLoading(false);
      const e = err instanceof Error ? err.message : JSON.stringify(err);
      dispatch(LogActions.error('[TransactionProposalDetails] ', e));
    }
  };

  const checkPayPro = async () => {
    try {
      setPayproIsLoading(true);
      await dispatch(startOnGoingProcessModal('FETCHING_PAYMENT_INFO'));
      const address = (await dispatch<Promise<string>>(
        createWalletAddress({wallet: wallet, newAddress: false}),
      )) as string;
      const payload = {
        address,
      };
      const _payProDetails = await GetPayProDetails({
        paymentUrl: txp.payProUrl,
        coin: txp.coin,
        chain: txp.chain,
        payload,
      });
      paymentTimeControl(_payProDetails.expires);
      setPayProDetails(_payProDetails);
      setPayproIsLoading(false);
      dispatch(dismissOnGoingProcessModal());
    } catch (err) {
      setPayproIsLoading(false);
      dispatch(dismissOnGoingProcessModal());
      logger.warn('Error fetching this invoice: ' + BWCErrorMessage(err));
      await dispatch(
        showBottomNotificationModal(
          CustomErrorMessage({
            errMsg: BWCErrorMessage(err),
            title: t('Error fetching this invoice'),
          }),
        ),
      );
    }
  };

  const paymentTimeControl = (expires: string): void => {
    const expirationTime = Math.floor(new Date(expires).getTime() / 1000);
    setPaymentExpired(false);
    setExpirationTime(expirationTime);

    countDown = setInterval(() => {
      setExpirationTime(expirationTime, countDown);
    }, 1000);
  };

  const setExpirationTime = (
    expirationTime: number,
    countDown?: NodeJS.Timer,
  ): void => {
    const now = Math.floor(Date.now() / 1000);

    if (now > expirationTime) {
      setPaymentExpired(true);
      setRemainingTimeStr(t('Expired'));
      if (countDown) {
        /* later */
        clearInterval(countDown);
      }
      return;
    }
    const totalSecs = expirationTime - now;
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    setRemainingTimeStr(('0' + m).slice(-2) + ':' + ('0' + s).slice(-2));
  };

  const getIcon = () => {
    return SUPPORTED_CURRENCIES.includes(wallet.currencyAbbreviation) ? (
      CurrencyListIcons[wallet.currencyAbbreviation]({width: 18, height: 18})
    ) : (
      <DefaultSvg width={18} height={18} />
    );
  };

  const broadcastTxp = async (txp: TransactionProposal) => {
    dispatch(startOnGoingProcessModal('BROADCASTING_TXP'));

    try {
      logger.debug('Trying to broadcast Txp');
      const broadcastedTx = await broadcastTx(wallet, txp);
      logger.debug(`Transaction broadcasted: ${broadcastedTx.txid}`);
      const {fee, amount} = broadcastedTx as {
        fee: number;
        amount: number;
      };
      const targetAmount = wallet.balance.sat - (fee + amount);

      dispatch(
        waitForTargetAmountAndUpdateWallet({
          key,
          wallet,
          targetAmount,
        }),
      );
      dispatch(dismissOnGoingProcessModal());
      dispatch(
        AppActions.showPaymentSentModal({
          onDismissModal: async () => {
            navigation.goBack();
          },
          title: lastSigner ? t('Payment Sent') : t('Payment Accepted'),
        }),
      );
    } catch (err: any) {
      logger.error(
        `Could not broadcast Txp. Coin: ${txp.coin} - Chain: ${txp.chain} - Network: ${wallet.network} - Raw: ${txp.raw}`,
      );
      let msg: string = t('Could not broadcast payment');
      if (typeof err?.message === 'string') {
        msg = msg + `: ${err.message}`;
      }
      dispatch(dismissOnGoingProcessModal());
      await dispatch(
        showBottomNotificationModal(
          CustomErrorMessage({
            errMsg: msg,
            title: t('Error'),
          }),
        ),
      );
    }
  };

  const removePaymentProposal = async () => {
    try {
      setShowOptions(false);
      dispatch(
        showBottomNotificationModal({
          type: 'warning',
          title: t('Warning!'),
          message: t('Are you sure you want to delete this transaction?'),
          enableBackdropDismiss: true,
          actions: [
            {
              text: t('DELETE'),
              action: async () => {
                await RemoveTxProposal(wallet, txp);
                dispatch(startUpdateWalletStatus({key, wallet, force: true}));
                navigation.goBack();
              },
              primary: true,
            },
            {
              text: t('CANCEL'),
              action: () => {},
            },
          ],
        }),
      );
    } catch (err) {
      const e = err instanceof Error ? err.message : JSON.stringify(err);
      dispatch(LogActions.error('[removePaymentProposal] ', e));
    }
  };

  const rejectPaymentProposal = async () => {
    try {
      setShowOptions(false);
      dispatch(
        showBottomNotificationModal({
          type: 'warning',
          title: t('Warning!'),
          message: t('Are you sure you want to reject this transaction?'),
          enableBackdropDismiss: true,
          actions: [
            {
              text: t('REJECT'),
              action: async () => {
                await RejectTxProposal(wallet, txp);
                dispatch(startUpdateWalletStatus({key, wallet, force: true}));
                navigation.goBack();
              },
              primary: true,
            },
            {
              text: t('CANCEL'),
              action: () => {},
            },
          ],
        }),
      );
    } catch (err) {
      const e = err instanceof Error ? err.message : JSON.stringify(err);
      dispatch(LogActions.error('[rejectPaymentProposal] ', e));
    }
  };

  useEffect(() => {
    init();
  }, [transaction, wallet]);

  useEffect(() => {
    if (txp?.payProUrl) {
      checkPayPro();
    }
  }, [txp]);

  useEffect(() => {
    return () => {
      if (countDown) {
        clearInterval(countDown);
      }
    };
  }, []);

  useEffect(() => {
    if (
      txp &&
      !txp.removed &&
      txp.pendingForUs &&
      !paymentExpired &&
      !txp.multisigContractAddress &&
      wallet.credentials.n > 1
    ) {
      setShowRejectButton(true);
    } else {
      setShowRejectButton(false);
    }

    if (
      (txp && !txp.removed && txp.canBeRemoved) ||
      (txp && txp.status === 'accepted' && !txp.broadcastedOn)
    ) {
      setShowRemoveButton(true);
    } else {
      setShowRemoveButton(false);
    }
  }, [txp, paymentExpired, wallet.credentials.n]);

  const showErrorMessage = useCallback(
    (msg: BottomNotificationConfig) => {
      dispatch(showBottomNotificationModal(msg));
    },
    [dispatch],
  );

  return (
    <TxpDetailsContainer>
      {!isLoading && txp ? (
        <ScrollView>
          <>
            {NotZeroAmountEVM(txp.amount, currencyAbbreviation) ? (
              <H2 medium={true}>{txp.amountStr}</H2>
            ) : null}

            {!IsCustomERCToken(currencyAbbreviation, chain) ? (
              <SubTitle>
                {!txp.fiatRateStr
                  ? '...'
                  : isTestnet
                  ? t('Test Only - No Value')
                  : txp.fiatRateStr}
              </SubTitle>
            ) : null}

            {!NotZeroAmountEVM(txp.amount, currencyAbbreviation) ? (
              <SubTitle>{t('Interaction with contract')}</SubTitle>
            ) : null}
          </>

          {txp.removed ? (
            <Banner
              type={'info'}
              height={60}
              description={t('The payment was removed by creator.')}
            />
          ) : null}

          {txp.status === 'broadcasted' ? (
            <Banner
              type={'success'}
              height={60}
              description={t('Payment was successfully sent.')}
            />
          ) : null}

          {txp.status === 'rejected' ? (
            <Banner
              type={'success'}
              height={60}
              description={t('Payment Rejected.')}
            />
          ) : null}

          {txp.status === 'accepted' &&
          (!txp.payProUrl ||
            (payProDetails && !payproIsLoading && !paymentExpired)) ? (
            <>
              <Banner
                type={'info'}
                height={60}
                description={t('Payment accepted, but not yet broadcasted.')}
              />
              <Button
                onPress={() => {
                  broadcastTxp(txp);
                }}
                buttonType={'link'}>
                {t('Broadcast Payment')}
              </Button>
            </>
          ) : null}

          {(!txp.removed && txp.canBeRemoved) ||
          (txp.status === 'accepted' && !txp.broadcastedOn) ? (
            <>
              {!txp.payProUrl && wallet.credentials.n > 1 ? (
                <Banner
                  height={110}
                  type={'info'}
                  description={t(
                    '* A payment proposal can be deleted if 1) you are the creator, and no other copayer has signed, or 2) 10 minutes have passed since the proposal was created.',
                  )}
                />
              ) : null}
              {txp.payProUrl &&
              !payproIsLoading &&
              (!payProDetails || paymentExpired) ? (
                <Banner
                  type={'warning'}
                  description={t(
                    'Your payment proposal expired or was rejected by the receiver. Please, delete it and try again.',
                  )}
                />
              ) : null}
            </>
          ) : null}

          <DetailContainer>
            <H6>{t('DETAILS')}</H6>
          </DetailContainer>
          <Hr />

          {txp.feeStr && !IsReceived(txp.action) ? (
            <>
              <DetailContainer>
                <DetailRow>
                  <H7>{t('Miner fee')}</H7>
                  <DetailColumn>
                    <H6>{txp.feeStr}</H6>
                    {!isTestnet ? (
                      <H7>
                        {txp.feeFiatStr}{' '}
                        {txp.feeRateStr
                          ? '(' + txp.feeRateStr + t(' of total amount') + ')'
                          : null}
                      </H7>
                    ) : (
                      <SubTitle>{t('Test Only - No Value')}</SubTitle>
                    )}
                  </DetailColumn>
                </DetailRow>
              </DetailContainer>
              <Hr />
            </>
          ) : null}

          <MultipleOutputsTx tx={txp} />

          <>
            <DetailContainer>
              <DetailRow>
                <H7>{t('Sending from')}</H7>
                <SendToPillContainer>
                  <SendToPill
                    icon={getIcon()}
                    description={wallet.credentials.walletName}
                  />
                </SendToPillContainer>
              </DetailRow>
            </DetailContainer>
            <Hr />
          </>

          {txp.creatorName ? (
            <>
              <DetailContainer>
                <DetailRow>
                  <H7>{t('Created by')}</H7>

                  <H7>{txp.creatorName}</H7>
                </DetailRow>
              </DetailContainer>
              <Hr />
            </>
          ) : null}

          <DetailContainer>
            <DetailRow>
              <H7>{t('Date')}</H7>
              <H7>
                {GetAmFormatDate((txp.ts || txp.createdOn || txp.time) * 1000)}
              </H7>
            </DetailRow>
          </DetailContainer>

          <Hr />

          {txp.message &&
          (!payProDetails || payProDetails.memo !== txp.message) ? (
            <>
              <MemoMsgContainer>
                <H7>{t('Memo')}</H7>
                <MemoMsgText>{txp.message}</MemoMsgText>
              </MemoMsgContainer>
              <Hr />
            </>
          ) : null}

          {/*  TODO: Add Notify unconfirmed transaction  row */}

          {payProDetails ? (
            <>
              <DetailContainer>
                <H6>{t('Payment request')}</H6>
              </DetailContainer>
              <Hr />
              {paymentExpired ? (
                <DetailContainer>
                  <DetailRow>
                    <H7>{t('Expired')}</H7>
                    <H7>
                      {GetAmTimeAgo(new Date(payProDetails.expires).getTime())}
                    </H7>
                  </DetailRow>
                </DetailContainer>
              ) : (
                <DetailContainer>
                  <DetailRow>
                    <H7>{t('Expires')}</H7>
                    <H7>{remainingTimeStr}</H7>
                  </DetailRow>
                </DetailContainer>
              )}

              {payProDetails.memo ? (
                <>
                  <Hr />
                  <MemoMsgContainer>
                    <H7>{t('Merchant Message')}</H7>
                    <MemoMsgText>{payProDetails.memo}</MemoMsgText>
                  </MemoMsgContainer>
                </>
              ) : null}
              <Hr />
            </>
          ) : null}

          {!IsMultisigEthInfo(wallet) && txp.actionsList?.length ? (
            <>
              <TimelineContainer>
                <DetailContainer>
                  <H6>{t('Timeline')}</H6>
                </DetailContainer>

                <TimelineList actions={txp.actionsList} />
              </TimelineContainer>

              <Hr />
            </>
          ) : null}
        </ScrollView>
      ) : null}

      {txp &&
      !txp.removed &&
      txp.pendingForUs &&
      !key.isReadOnly &&
      (!txp.payProUrl ||
        (payProDetails && !payproIsLoading && !paymentExpired)) ? (
        <ButtonContainer>
          <Button
            buttonStyle={'primary'}
            onPress={async () => {
              try {
                dispatch(
                  startOnGoingProcessModal(
                    lastSigner ? 'SENDING_PAYMENT' : 'ACCEPTING_PAYMENT',
                  ),
                );
                await dispatch(publishAndSign({txp, key, wallet}));
                dispatch(dismissOnGoingProcessModal());
                dispatch(
                  AppActions.showPaymentSentModal({
                    onDismissModal: async () => {
                      navigation.goBack();
                    },
                    title: lastSigner
                      ? t('Payment Sent')
                      : t('Payment Accepted'),
                  }),
                );
              } catch (err) {
                dispatch(dismissOnGoingProcessModal());
                switch (err) {
                  case 'invalid password':
                    dispatch(showBottomNotificationModal(WrongPasswordError()));
                    break;
                  case 'password canceled':
                    break;
                  default:
                    await showErrorMessage(
                      CustomErrorMessage({
                        errMsg: BWCErrorMessage(err),
                        title: t('Uh oh, something went wrong'),
                      }),
                    );
                }
              }
            }}>
            {lastSigner ? t('Click to send') : t('Click to accept')}
          </Button>
        </ButtonContainer>
      ) : null}
      <SheetModal
        placement={'top'}
        isVisible={showOptions}
        onBackdropPress={() => setShowOptions(false)}>
        <SheetContainer placement={'top'}>
          {showRejectButton ? (
            <OptionContainer placement={'top'} onPress={rejectPaymentProposal}>
              <OptionIconContainer>
                {theme.dark ? (
                  <RejectIconWhite width={22} />
                ) : (
                  <RejectIcon width={22} />
                )}
              </OptionIconContainer>
              <OptionTextContainer>
                <OptionTitleText isReject={true}>
                  {t('Reject Payment Proposal')}
                </OptionTitleText>
              </OptionTextContainer>
            </OptionContainer>
          ) : null}
          {showRemoveButton ? (
            <OptionContainer placement={'top'} onPress={removePaymentProposal}>
              <OptionIconContainer>
                {theme.dark ? (
                  <DeleteIconWhite width={22} />
                ) : (
                  <DeleteIcon color={Caution} width={22} />
                )}
              </OptionIconContainer>
              <OptionTextContainer>
                <OptionTitleText isReject={false}>
                  {t('Delete payment proposal')}
                </OptionTitleText>
              </OptionTextContainer>
            </OptionContainer>
          ) : null}
        </SheetContainer>
      </SheetModal>
    </TxpDetailsContainer>
  );
};

export default TransactionProposalDetails;
