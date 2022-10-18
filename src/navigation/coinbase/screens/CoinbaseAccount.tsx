import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {useAppDispatch, useAppSelector} from '../../../utils/hooks';
import styled from 'styled-components/native';
import {FlatList, RefreshControl} from 'react-native';
import {find} from 'lodash';
import moment from 'moment';
import {
  getCurrencyAbbreviation,
  getProtocolName,
  sleep,
} from '../../../utils/helper-methods';
import {useNavigation, useTheme} from '@react-navigation/native';
import {formatFiatAmount, shouldScale} from '../../../utils/helper-methods';
import {Hr, ScreenGutter} from '../../../components/styled/Containers';
import {BaseText, Balance, H5} from '../../../components/styled/Text';
import {
  Air,
  Black,
  LightBlack,
  LuckySevens,
  SlateDark,
  White,
} from '../../../styles/colors';
import GhostSvg from '../../../../assets/img/ghost-straight-face.svg';
import WalletTransactionSkeletonRow from '../../../components/list/WalletTransactionSkeletonRow';
import LinkingButtons from '../../tabs/home/components/LinkingButtons';
import TransactionRow from '../../../components/list/TransactionRow';
import SheetModal from '../../../components/modal/base/sheet/SheetModal';
import GlobalSelect from '../../../navigation/wallet/screens/GlobalSelect';

import {StackScreenProps} from '@react-navigation/stack';
import {CoinbaseStackParamList} from '../CoinbaseStack';
import {
  CoinbaseErrorsProps,
  CoinbaseTransactionProps,
} from '../../../api/coinbase/coinbase.types';
import CoinbaseIcon from '../components/CoinbaseIcon';
import {
  coinbaseParseErrorToString,
  coinbaseCreateAddress,
  coinbaseGetAccountsAndBalance,
  coinbaseGetTransactionsByAccount,
  coinbaseGetFiatAmount,
} from '../../../store/coinbase';
import {
  dismissOnGoingProcessModal,
  showBottomNotificationModal,
  showOnGoingProcessModal,
} from '../../../store/app/app.actions';
import {OnGoingProcessMessages} from '../../../components/modal/ongoing-process/OngoingProcess';
import {COINBASE_ENV} from '../../../api/coinbase/coinbase.constants';
import {
  ToCashAddress,
  TranslateToBchCashAddress,
} from '../../../store/wallet/effects/address/address';
import AmountModal from '../../../components/amount/AmountModal';
import {Wallet} from '../../../store/wallet/wallet.models';
import {useTranslation} from 'react-i18next';
import {logSegmentEvent} from '../../../store/app/app.effects';
import {IsUtxoCoin} from '../../../store/wallet/utils/currency';
import Icons from '../../wallet/components/WalletIcons';

const AccountContainer = styled.View`
  flex: 1;
`;

const Row = styled.View`
  align-items: center;
`;

const BalanceContainer = styled.View`
  margin: 20px 0;
  padding: 0 15px 10px;
`;

const HeaderSubTitleContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

const TypeContainer = styled(HeaderSubTitleContainer)`
  border: 1px solid ${({theme: {dark}}) => (dark ? LightBlack : '#E1E4E7')};
  padding: 2px 5px;
  border-radius: 3px;
  margin-top: 5px;
  margin-bottom: 10px;
`;

const TypeText = styled(BaseText)`
  font-size: 12px;
  color: ${({theme: {dark}}) => (dark ? LuckySevens : SlateDark)};
`;

const Type = styled(BaseText)`
  font-size: 12px;
  color: ${({theme: {dark}}) => (dark ? LuckySevens : SlateDark)};
  border: 1px solid ${({theme: {dark}}) => (dark ? LightBlack : '#E1E4E7')};
  padding: 2px 5px;
  border-radius: 3px;
  margin-top: 5px;
  margin-bottom: 10px;
`;

const TransactionListHeader = styled.View`
  padding: 10px;
  background-color: ${({theme: {dark}}) => (dark ? LightBlack : '#F5F6F7')};
`;

const BorderBottom = styled.View`
  border-bottom-width: 1px;
  border-bottom-color: ${({theme: {dark}}) => (dark ? LightBlack : Air)};
`;

const EmptyListContainer = styled.View`
  justify-content: space-between;
  align-items: center;
  margin-top: 50px;
`;

const SkeletonContainer = styled.View`
  margin-bottom: 20px;
`;

const GlobalSelectContainer = styled.View`
  flex: 1;
  background-color: ${({theme: {dark}}) => (dark ? Black : White)};
`;

const IconContainer = styled.View`
  margin-right: 5px;
`;

export const WalletSelectMenuContainer = styled.View`
  padding: ${ScreenGutter};
  background: ${({theme: {dark}}) => (dark ? LightBlack : White)};
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  max-height: 75%;
`;

export const WalletSelectMenuHeaderContainer = styled.View`
  padding: 50px 0;
`;

export type CoinbaseAccountScreenParamList = {
  accountId: string;
  refresh?: boolean;
};

const CoinbaseAccount = ({
  route,
}: StackScreenProps<CoinbaseStackParamList, 'CoinbaseAccount'>) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const {accountId, refresh} = route.params;

  const [refreshing, setRefreshing] = useState(false);
  const [customSupportedCurrencies, setCustomSupportedCurrencies] = useState(
    [] as string[],
  );
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [fiatAmount, setFiatAmount] = useState(0);
  const [cryptoAmount, setCryptoAmount] = useState('0');
  const [txs, setTxs] = useState([] as CoinbaseTransactionProps[]);

  const keys = useAppSelector(({WALLET}) => WALLET.keys);

  const [availableWalletToDeposit, setAvailableWalletToDeposit] =
    useState(false);
  const [availableWalletToWithdraw, setAvailableWalletToWithdraw] =
    useState(false);

  const [selectedWallet, setSelectedWallet] = useState<Wallet>();

  const defaultAltCurrency = useAppSelector(({APP}) => APP.defaultAltCurrency);
  const exchangeRates = useAppSelector(({COINBASE}) => COINBASE.exchangeRates);
  const transactions = useAppSelector(
    ({COINBASE}) => COINBASE.transactions[COINBASE_ENV],
  );
  const account = useAppSelector(({COINBASE}) => {
    return find(COINBASE.accounts[COINBASE_ENV], {id: accountId});
  });

  const txsStatus = useAppSelector(
    ({COINBASE}) => COINBASE.getTransactionsStatus,
  );

  const txsLoading = useAppSelector(({COINBASE}) => COINBASE.isApiLoading);

  const [isLoading, setIsLoading] = useState<boolean>(txsLoading);
  const [errorLoadingTxs, setErrorLoadingTxs] = useState<boolean>();
  const [initialLoad, setInitialLoad] = useState<boolean>(true);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: account?.name,
    });
  }, [navigation, account]);

  const parseTime = (timestamp?: string) => {
    return timestamp ? moment(timestamp).format('MMM D, YYYY') : '';
  };

  const parseAmount = (amount?: string, coin?: string) => {
    return amount && coin ? amount + ' ' + coin : '';
  };

  const getIcon = (coinbaseTx: CoinbaseTransactionProps) => {
    return CoinbaseIcon(coinbaseTx);
  };

  const [currencyAbbreviation, setCurrencyAbbreviation] = useState('');
  const [chain, setChain] = useState('');
  const [protocolName, setProtocolName] = useState('');

  const onPressTransaction = useMemo(
    () => (transaction: any) => {
      navigation.navigate('Coinbase', {
        screen: 'CoinbaseTransaction',
        params: {tx: transaction},
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({item}) => (
      <TransactionRow
        icon={getIcon(item)}
        description={item.details.title}
        details={item.details.subtitle}
        time={parseTime(item.created_at)}
        value={parseAmount(item.amount.amount, item.amount.currency)}
        onPressTransaction={() => onPressTransaction(item)}
      />
    ),
    [onPressTransaction],
  );

  const listFooterComponent = () => {
    return (
      <>
        {isLoading && initialLoad && !txs.length ? (
          <SkeletonContainer>
            <WalletTransactionSkeletonRow />
          </SkeletonContainer>
        ) : null}
      </>
    );
  };

  const listEmptyComponent = () => {
    return (
      <>
        {!initialLoad && !txs.length && (
          <EmptyListContainer>
            <H5>
              {!errorLoadingTxs
                ? t("It's a ghost town in here")
                : t('Could not update transaction history')}
            </H5>
            <GhostSvg style={{marginTop: 20}} />
          </EmptyListContainer>
        )}
      </>
    );
  };

  useEffect(() => {
    // all wallets
    let availableWallets = Object.values(keys)
      .filter(key => key.backupComplete)
      .flatMap(key => key.wallets);

    if (account && account.balance) {
      const _currencyAbbreviation = account.balance.currency;
      const _chain =
        IsUtxoCoin(_currencyAbbreviation.toLowerCase()) ||
        _currencyAbbreviation.toLowerCase() === 'xrp'
          ? _currencyAbbreviation.toLowerCase()
          : 'eth';

      availableWallets = availableWallets.filter(
        wallet =>
          !wallet.hideWallet &&
          wallet.network === 'livenet' &&
          wallet.isComplete() &&
          wallet.currencyAbbreviation.toLowerCase() ===
            account.currency.code.toLocaleLowerCase() &&
          wallet.chain === _chain,
      );

      if (availableWallets.length) {
        // Withdrawals to BitPay Wallet
        if (account.allow_withdrawals && Number(account.balance.amount) > 0) {
          setAvailableWalletToWithdraw(true);
        }
        // Deposit into Coinbase Account
        if (
          account.allow_deposits &&
          availableWallets.filter(wallet => wallet.balance.sat > 0).length
        ) {
          setAvailableWalletToDeposit(true);
        }
      }

      setCurrencyAbbreviation(_currencyAbbreviation);
      setChain(_chain);
      setProtocolName(getProtocolName(_chain, 'livenet') || '');

      const _currency = getCurrencyAbbreviation(
        _currencyAbbreviation.toLowerCase(),
        _chain,
      );

      const currencies: string[] = [];
      currencies.push(_currency);
      setCustomSupportedCurrencies(currencies);

      if (Number(account.balance.amount)) {
        const fa = coinbaseGetFiatAmount(
          account.balance.amount,
          account.balance.currency,
          exchangeRates,
        );
        setFiatAmount(fa);
        setCryptoAmount(account.balance.amount.toString());
      } else {
        setFiatAmount(0);
        setCryptoAmount('0');
      }
    }

    if (transactions && transactions[accountId]) {
      const tx = transactions[accountId].data;
      setTxs(tx);
    }

    if (txsLoading) {
      setIsLoading(true);
    } else {
      setInitialLoad(false);
      setIsLoading(false);
    }

    if (txsStatus && txsStatus === 'failed') {
      setErrorLoadingTxs(true);
    }
  }, [
    account,
    transactions,
    txsLoading,
    txsStatus,
    accountId,
    exchangeRates,
    keys,
    currencyAbbreviation,
    chain,
    protocolName,
  ]);

  const deposit = async () => {
    // Deposit:
    //   Transfer from BitPay wallet to Coinbase Account
    if (!account) {
      return;
    }
    dispatch(
      showOnGoingProcessModal(
        // t('Fetching data from Coinbase...')
        t(OnGoingProcessMessages.FETCHING_COINBASE_DATA),
      ),
    );
    dispatch(
      logSegmentEvent('track', 'Clicked Receive', {
        context: 'CoinbaseAccount',
      }),
    );
    dispatch(coinbaseCreateAddress(accountId))
      .then(async newAddress => {
        dispatch(dismissOnGoingProcessModal());
        if (!newAddress) {
          return;
        }
        if (account?.currency.code === 'BCH') {
          // Convert old format bch address to bch cash address
          newAddress = TranslateToBchCashAddress(newAddress);
          newAddress = ToCashAddress(newAddress, false);
        }
        await sleep(400);
        navigation.navigate('Wallet', {
          screen: 'GlobalSelect',
          params: {
            context: 'coinbase',
            recipient: {
              name: account.name || 'Coinbase',
              currency: account.currency.code.toLowerCase(),
              address: newAddress,
              network: 'livenet',
            },
          },
        });
      })
      .catch(error => {
        showError(error);
      });
  };

  const onSelectedWallet = async (newWallet?: Wallet) => {
    setWalletModalVisible(false);
    dispatch(
      logSegmentEvent('track', 'Clicked Send', {
        context: 'CoinbaseAccount',
      }),
    );
    if (newWallet) {
      setSelectedWallet(newWallet);
      await sleep(500);
      setAmountModalVisible(true);
    }
  };

  const onEnteredAmount = (newAmount?: number) => {
    setAmountModalVisible(false);
    if (newAmount && selectedWallet) {
      navigation.navigate('Coinbase', {
        screen: 'CoinbaseWithdraw',
        params: {accountId, wallet: selectedWallet, amount: newAmount},
      });
    }
  };

  const showError = async (error: CoinbaseErrorsProps) => {
    const errMsg = coinbaseParseErrorToString(error);
    if (errMsg === 'Network Error') {
      return;
    }
    dispatch(
      showBottomNotificationModal({
        type: 'error',
        title: t('Coinbase error'),
        message: errMsg,
        enableBackdropDismiss: true,
        actions: [
          {
            text: t('OK'),
            action: () => {},
            primary: true,
          },
        ],
      }),
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await sleep(1000);

    try {
      await dispatch(coinbaseGetAccountsAndBalance());
      await dispatch(coinbaseGetTransactionsByAccount(accountId));
    } catch (err: CoinbaseErrorsProps | any) {
      setRefreshing(false);
      showError(err);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (refresh) {
      onRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AccountContainer>
      <FlatList
        refreshControl={
          <RefreshControl
            tintColor={theme.dark ? White : SlateDark}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        ListHeaderComponent={() => {
          return (
            <>
              <BalanceContainer>
                <Row>
                  {cryptoAmount && (
                    <Balance scale={shouldScale(cryptoAmount)}>
                      {cryptoAmount} {currencyAbbreviation}
                    </Balance>
                  )}
                </Row>
                <Row>
                  <H5>
                    {fiatAmount
                      ? formatFiatAmount(fiatAmount, defaultAltCurrency.isoCode)
                      : '0'}
                  </H5>
                  {account?.primary ? <Type>Primary</Type> : null}
                  {protocolName ? (
                    <TypeContainer>
                      <IconContainer>
                        <Icons.Network />
                      </IconContainer>
                      <TypeText>{protocolName}</TypeText>
                    </TypeContainer>
                  ) : null}
                </Row>
                <LinkingButtons
                  receive={{
                    cta: deposit,
                    label: t('deposit'),
                    hide: !availableWalletToDeposit,
                  }}
                  send={{
                    cta: () => {
                      setWalletModalVisible(true);
                    },
                    label: t('withdraw'),
                    hide: !availableWalletToWithdraw,
                  }}
                  buy={{cta: () => null, hide: true}}
                  swap={{cta: () => null, hide: true}}
                />
              </BalanceContainer>
              <Hr />
              {txs[0] ? (
                <TransactionListHeader>
                  <H5>{t('Transactions')}</H5>
                </TransactionListHeader>
              ) : (
                <></>
              )}
            </>
          );
        }}
        data={txs}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <BorderBottom />}
        ListFooterComponent={listFooterComponent}
        ListEmptyComponent={listEmptyComponent}
      />

      <SheetModal
        isVisible={walletModalVisible}
        onBackdropPress={() => setWalletModalVisible(false)}>
        <GlobalSelectContainer>
          <GlobalSelect
            modalTitle={t('Select destination wallet')}
            customSupportedCurrencies={customSupportedCurrencies}
            useAsModal={true}
            livenetOnly={true}
            onDismiss={onSelectedWallet}
          />
        </GlobalSelectContainer>
      </SheetModal>

      <AmountModal
        isVisible={amountModalVisible}
        cryptoCurrencyAbbreviation={currencyAbbreviation}
        fiatCurrencyAbbreviation={defaultAltCurrency.isoCode}
        chain={chain}
        onClose={() => setAmountModalVisible(false)}
        onSubmit={amt => onEnteredAmount(amt)}
      />
    </AccountContainer>
  );
};

export default CoinbaseAccount;
