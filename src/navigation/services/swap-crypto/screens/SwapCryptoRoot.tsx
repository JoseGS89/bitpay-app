import React, {useEffect, useState} from 'react';
import {ActivityIndicator, ScrollView, TouchableOpacity} from 'react-native';
import {useTheme, useNavigation, useRoute} from '@react-navigation/native';
import {RouteProp} from '@react-navigation/core';
import cloneDeep from 'lodash.clonedeep';
import {SupportedCurrencyOptions} from '../../../../constants/SupportedCurrencyOptions';
import {
  SUPPORTED_COINS,
  SUPPORTED_ETHEREUM_TOKENS,
} from '../../../../constants/currencies';
import {
  Action,
  SlateDark,
  White,
  ProgressBlue,
} from '../../../../styles/colors';
import {
  CtaContainer,
  SwapCryptoCard,
  SummaryTitle,
  ArrowContainer,
  SelectorArrowContainer,
  ActionsContainer,
  SelectedOptionContainer,
  SelectedOptionText,
  SelectedOptionCol,
  CoinIconContainer,
  DataText,
  BottomDataText,
  ProviderContainer,
  ProviderLabel,
  SpinnerContainer,
} from '../styled/SwapCryptoRoot.styled';
import {SwapCryptoStackParamList} from '../SwapCryptoStack';
import Button from '../../../../components/button/Button';
import ChangellyLogo from '../../../../components/icons/external-services/changelly/changelly-logo';
import {CurrencyImage} from '../../../../components/currency-image/CurrencyImage';
import {OnGoingProcessMessages} from '../../../../components/modal/ongoing-process/OngoingProcess';
import FromWalletSelectorModal from '../components/FromWalletSelectorModal';
import ToWalletSelectorModal from '../components/ToWalletSelectorModal';
import AmountModal from '../../../../components/amount/AmountModal';
import {
  changellyGetPairsParams,
  changellyGetFixRateForAmount,
  ChangellyCurrency,
  getChangellyCurrenciesFixedProps,
  getChangellyFixedCurrencyAbbreviation,
} from '../utils/changelly-utils';
import {useAppDispatch, useAppSelector} from '../../../../utils/hooks';
import {getCurrencyAbbreviation, sleep} from '../../../../utils/helper-methods';
import {useLogger} from '../../../../utils/hooks/useLogger';
import {IsERCToken} from '../../../../store/wallet/utils/currency';
import {getFeeRatePerKb} from '../../../../store/wallet/effects/fee/fee';
import {Wallet, SendMaxInfo} from '../../../../store/wallet/wallet.models';
import {changellyGetCurrencies} from '../../../../store/swap-crypto/effects/changelly/changelly';
import {
  startOnGoingProcessModal,
  openUrlWithInAppBrowser,
  logSegmentEvent,
} from '../../../../store/app/app.effects';
import {
  dismissOnGoingProcessModal,
  showBottomNotificationModal,
} from '../../../../store/app/app.actions';
import ArrowDown from '../../../../../assets/img/services/swap-crypto/down-arrow.svg';
import SelectorArrowDown from '../../../../../assets/img/selector-arrow-down.svg';
import {AppActions} from '../../../../store/app';
import {useTranslation} from 'react-i18next';
import {getSendMaxInfo} from '../../../../store/wallet/effects/send/send';
import {
  GetExcludedUtxosMessage,
  SatToUnit,
} from '../../../../store/wallet/effects/amount/amount';
import {orderBy} from 'lodash';
import {
  addWallet,
  AddWalletData,
  getDecryptPassword,
} from '../../../../store/wallet/effects/create/create';
import {WrongPasswordError} from '../../../wallet/components/ErrorMessages';

export interface RateData {
  fixedRateId: string;
  amountTo: number;
  rate: number;
}

export interface SwapOpts {
  maxWalletAmount?: string;
  swapLimits: SwapLimits;
}

export interface SwapLimits {
  minAmount?: number;
  maxAmount?: number;
}

export interface SwapCryptoCoin {
  currencyAbbreviation: string;
  symbol: string;
  chain: string;
  name: string;
  protocol?: string;
  logoUri?: any;
  contractAddress?: string;
}

export const getChainFromChangellyProtocol = (
  currencyAbbreviation: string,
  protocol?: string,
): string => {
  switch (protocol?.toLowerCase()) {
    case 'erc20':
      return 'eth';
    case 'matic':
      return 'matic';
    default:
      return currencyAbbreviation.toLowerCase();
  }
};

const SwapCryptoRoot: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const logger = useLogger();
  const keys = useAppSelector(({WALLET}) => WALLET.keys);
  const countryData = useAppSelector(({LOCATION}) => LOCATION.countryData);
  const tokenData = useAppSelector(({WALLET}) => WALLET.tokenData);
  const tokenOptions = useAppSelector(({WALLET}) => WALLET.tokenOptions);
  const route = useRoute<RouteProp<SwapCryptoStackParamList, 'Root'>>();
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [fromWalletSelectorModalVisible, setFromWalletSelectorModalVisible] =
    useState(false);
  const [toWalletSelectorModalVisible, setToWalletSelectorModalVisible] =
    useState(false);
  const [fromWalletSelected, setFromWalletSelected] = useState<Wallet>();
  const [fromWalletData, setFromWalletData] = useState<SwapCryptoCoin>();
  const [useDefaultToWallet, setUseDefaultToWallet] = useState<boolean>(false);
  const [toWalletSelected, setToWalletSelected] = useState<Wallet>();
  const [toWalletData, setToWalletData] = useState<SwapCryptoCoin>();
  const [amountFrom, setAmountFrom] = useState<number>(0);
  const [swapCryptoAllSupportedCoins, setSwapCryptoAllSupportedCoins] =
    useState<SwapCryptoCoin[]>([]);
  const [swapCryptoSupportedCoinsFrom, setSwapCryptoSupportedCoinsFrom] =
    useState<SwapCryptoCoin[]>([]);
  const [swapCryptoSupportedCoinsTo, setSwapCryptoSupportedCoinsTo] = useState<
    SwapCryptoCoin[]
  >([]);
  const [rateData, setRateData] = useState<RateData>();
  const [loading, setLoading] = useState<boolean>(false);
  const [useSendMax, setUseSendMax] = useState<boolean>(false);
  const [sendMaxInfo, setSendMaxInfo] = useState<SendMaxInfo | undefined>();

  const selectedWallet = route.params?.selectedWallet;
  const SupportedEthereumTokens: string[] = SUPPORTED_ETHEREUM_TOKENS;
  const SupportedChains: string[] = SUPPORTED_COINS;
  const [swapLimits, setSwapLimits] = useState<SwapLimits>({
    minAmount: undefined,
    maxAmount: undefined,
  });
  let minAmount: number, maxAmount: number;

  const showModal = (id: string) => {
    switch (id) {
      case 'fromWalletSelector':
        setFromWalletSelectorModalVisible(true);
        break;
      case 'toWalletSelector':
        setToWalletSelectorModalVisible(true);
        break;
      case 'amount':
        setAmountModalVisible(true);
        break;
      default:
        break;
    }
  };

  const hideModal = (id: string) => {
    switch (id) {
      case 'fromWalletSelector':
        setFromWalletSelectorModalVisible(false);
        break;
      case 'toWalletSelector':
        setToWalletSelectorModalVisible(false);
        break;
      case 'amount':
        setAmountModalVisible(false);
        break;
      default:
        break;
    }
  };

  const canContinue = (): boolean => {
    return (
      !!toWalletSelected &&
      !!fromWalletSelected &&
      amountFrom > 0 &&
      !!rateData &&
      !!rateData.fixedRateId
    );
  };

  const setSelectedWallet = () => {
    if (selectedWallet) {
      if (selectedWallet.balance?.satSpendable > 0) {
        setFromWallet(selectedWallet);
      } else if (selectedWallet.balance?.satSpendable === 0) {
        setToWallet(selectedWallet);
        setUseDefaultToWallet(true);
      } else {
        logger.warn('It was not possible to set the selected wallet');
      }
    }
  };

  const setFromWallet = (fromWallet: Wallet) => {
    if (!useDefaultToWallet) {
      setToWalletSelected(undefined);
      setToWalletData(undefined);
    }
    setAmountFrom(0);
    setUseSendMax(false);
    setSendMaxInfo(undefined);
    setLoading(false);
    setRateData(undefined);

    const coinsTo = cloneDeep(swapCryptoSupportedCoinsFrom).filter(
      coin =>
        coin.currencyAbbreviation !==
        fromWallet.currencyAbbreviation?.toLowerCase(),
    );

    setSwapCryptoSupportedCoinsTo(coinsTo);
    setFromWalletSelected(fromWallet);
  };

  const setToWallet = (toWallet: Wallet) => {
    setRateData(undefined);
    setToWalletSelected(toWallet);
  };

  const isToWalletEnabled = (): boolean => {
    return !!fromWalletSelected;
  };

  const updateWalletData = () => {
    if (fromWalletSelected) {
      setFromWalletData(
        swapCryptoAllSupportedCoins.find(
          ({currencyAbbreviation}) =>
            currencyAbbreviation ===
            fromWalletSelected.currencyAbbreviation.toLowerCase(),
        ),
      );
    }
    if (toWalletSelected) {
      setToWalletData(
        swapCryptoAllSupportedCoins.find(
          ({currencyAbbreviation}) =>
            currencyAbbreviation ===
            toWalletSelected.currencyAbbreviation.toLowerCase(),
        ),
      );
    }
  };

  const updateReceivingAmount = () => {
    if (!fromWalletSelected || !toWalletSelected || !amountFrom) {
      setLoading(false);
      return;
    }

    setLoading(true);

    if (fromWalletSelected.balance?.satSpendable) {
      const spendableAmount = dispatch(
        SatToUnit(
          fromWalletSelected.balance.satSpendable,
          fromWalletSelected.currencyAbbreviation,
          fromWalletSelected.chain,
        ),
      );

      if (!!spendableAmount && spendableAmount < amountFrom) {
        const msg = t(
          'You are trying to send more funds than you have available. Make sure you do not have funds locked by pending transaction proposals or enter a valid amount.',
        );
        showError(msg);
        setLoading(false);
        setAmountFrom(0);
        setUseSendMax(false);
        setSendMaxInfo(undefined);
        setRateData(undefined);
        return;
      }
    }

    const pair =
      fromWalletSelected.currencyAbbreviation.toLowerCase() +
      '_' +
      toWalletSelected.currencyAbbreviation.toLowerCase();
    logger.debug('Updating receiving amount with pair: ' + pair);

    const data = {
      amountFrom: amountFrom,
      coinFrom: getChangellyFixedCurrencyAbbreviation(
        fromWalletSelected.currencyAbbreviation.toLowerCase(),
        fromWalletSelected.chain,
      ),
      coinTo: getChangellyFixedCurrencyAbbreviation(
        toWalletSelected.currencyAbbreviation.toLowerCase(),
        toWalletSelected.chain,
      ),
    };
    changellyGetFixRateForAmount(fromWalletSelected, data)
      .then((data: any) => {
        if (data.error) {
          const msg =
            t('Changelly getFixRateForAmount Error: ') + data.error.message;
          showError(msg);
          return;
        }

        const newRateData: RateData = {
          fixedRateId: data.result[0].id,
          amountTo: Number(data.result[0].amountTo),
          rate: Number(data.result[0].result), // result == rate
        };
        setRateData(newRateData);
        setLoading(false);
      })
      .catch(err => {
        logger.error(
          'Changelly getFixRateForAmount Error: ' + JSON.stringify(err),
        );
        const title = t('Changelly Error');
        const msg = t(
          'Changelly is not available at this moment. Please try again later.',
        );
        showError(msg, title);
      });
  };

  const changellyGetPairParams = () => {
    setRateData(undefined);
    if (!fromWalletSelected || !toWalletSelected) {
      return;
    }

    let pair =
      fromWalletSelected.currencyAbbreviation.toLowerCase() +
      '_' +
      toWalletSelected.currencyAbbreviation.toLowerCase();
    logger.debug('Updating max and min with pair: ' + pair);

    const data = {
      coinFrom: getChangellyFixedCurrencyAbbreviation(
        fromWalletSelected.currencyAbbreviation,
        fromWalletSelected.chain,
      ),
      coinTo: getChangellyFixedCurrencyAbbreviation(
        toWalletSelected.currencyAbbreviation,
        toWalletSelected.chain,
      ),
    };
    changellyGetPairsParams(fromWalletSelected, data)
      .then(async (data: any) => {
        if (data.error) {
          let msg: string;
          const title = t('Changelly Error');
          if (
            Math.abs(data.error.code) == 32602 &&
            data.error.message.indexOf('Invalid currency:') != -1
          ) {
            const actions = [
              {
                text: t('OK'),
                action: () => {},
                primary: true,
              },
              {
                text: t('Submit a ticket'),
                action: async () => {
                  await sleep(1000);
                  dispatch(
                    openUrlWithInAppBrowser(
                      'https://support.changelly.com/en/support/tickets/new',
                    ),
                  );
                },
                primary: true,
              },
            ];
            msg =
              data.error.message +
              '.' +
              t(
                'This is a temporary Changelly decision. If you have further questions please reach out to them.',
              );
            showError(msg, title, actions);
          } else {
            msg = t('Changelly getPairsParams Error: ') + data.error.message;
            showError(msg);
          }
          return;
        }

        if (
          data.result &&
          data.result[0] &&
          Number(data.result[0].maxAmountFixed) <= 0
        ) {
          const title = t('Changelly Error');
          const actions = [
            {
              text: t('OK'),
              action: () => {},
              primary: true,
            },
            {
              text: t('Submit a ticket'),
              action: async () => {
                await sleep(1000);
                dispatch(
                  openUrlWithInAppBrowser(
                    'https://support.changelly.com/en/support/tickets/new',
                  ),
                );
              },
              primary: true,
            },
          ];
          const msg = t(
            'Changelly has temporarily disabled - pair. If you have further questions please reach out to them.',
            {
              fromWalletSelected: fromWalletSelected.currencyAbbreviation,
              toWalletSelected: toWalletSelected.currencyAbbreviation,
            },
          );
          showError(msg, title, actions);
          return;
        }

        minAmount = Number(data.result[0].minAmountFixed);
        maxAmount = Number(data.result[0].maxAmountFixed);
        setSwapLimits({
          minAmount,
          maxAmount,
        });
        logger.debug(
          `Min amount: ${Number(
            data.result[0].minAmountFixed,
          )} - Max amount: ${Number(data.result[0].maxAmountFixed)}`,
        );

        if (amountFrom) {
          if (amountFrom > maxAmount) {
            const msg =
              t('The amount entered is greater than the maximum allowed: ') +
              maxAmount +
              ' ' +
              fromWalletData?.currencyAbbreviation.toUpperCase();
            const actions = [
              {
                text: t('OK'),
                action: () => {},
                primary: true,
              },
              {
                text: t('Use Max Amount'),
                action: async () => {
                  setAmountFrom(maxAmount);
                  await sleep(400);
                  // updateReceivingAmount();
                },
                primary: true,
              },
            ];

            showError(msg, undefined, actions);
            return;
          }
          if (amountFrom < minAmount) {
            if (useSendMax && sendMaxInfo) {
              let msg = '';
              if (sendMaxInfo) {
                const warningMsg = dispatch(
                  GetExcludedUtxosMessage(
                    fromWalletSelected.currencyAbbreviation,
                    fromWalletSelected.chain,
                    sendMaxInfo,
                  ),
                );
                msg = warningMsg;
              }

              const estimatedFee = dispatch(
                SatToUnit(
                  sendMaxInfo.fee,
                  fromWalletSelected.currencyAbbreviation,
                  fromWalletSelected.chain,
                ),
              );
              const coin =
                fromWalletSelected.currencyAbbreviation.toUpperCase();

              const ErrMsg =
                `As the estimated miner fee to complete the transaction is ${estimatedFee} ${coin}, the maximum spendable amount of your wallet is ${amountFrom} ${coin} which is lower than the minimum allowed by the exchange: ${minAmount} ${coin}.` +
                `\n${msg}`;
              showError(ErrMsg);
              return;
            } else {
              const msg =
                t('The amount entered is lower than the minimum allowed: ') +
                minAmount +
                ' ' +
                fromWalletData?.currencyAbbreviation.toUpperCase();
              const actions = [
                {
                  text: t('OK'),
                  action: () => {},
                  primary: true,
                },
                {
                  text: t('Use Min Amount'),
                  action: async () => {
                    setAmountFrom(minAmount);
                    await sleep(400);
                  },
                  primary: true,
                },
              ];

              showError(msg, undefined, actions);
              return;
            }
          }
        }
        updateReceivingAmount();
      })
      .catch(err => {
        logger.error('Changelly getPairsParams Error: ' + JSON.stringify(err));
        const msg = t(
          'Changelly is not available at this moment. Please try again later.',
        );
        showError(msg);
      });
  };

  const getSendMaxData = (): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      if (!fromWalletSelected) {
        return resolve(undefined);
      }
      try {
        const feeLevel =
          fromWalletSelected.currencyAbbreviation == 'btc' ||
          fromWalletSelected.chain == 'eth'
            ? 'priority'
            : 'normal';

        const feeRate = await getFeeRatePerKb({
          wallet: fromWalletSelected,
          feeLevel,
        });

        const res = await getSendMaxInfo({
          wallet: fromWalletSelected,
          opts: {
            feePerKb: feeRate,
            excludeUnconfirmedUtxos: true, // Do not use unconfirmed UTXOs
            returnInputs: true,
          },
        });
        return resolve(res);
      } catch (err) {
        return reject(err);
      }
    });
  };

  const showError = async (
    msg?: string,
    title?: string,
    actions?: any,
    goBack?: boolean,
  ) => {
    dispatch(dismissOnGoingProcessModal());
    await sleep(400);
    setLoading(false);
    await sleep(600);
    dispatch(
      showBottomNotificationModal({
        type: 'error',
        title: title ? title : t('Error'),
        message: msg ? msg : t('Unknown Error'),
        enableBackdropDismiss: goBack ? false : true,
        actions: actions
          ? actions
          : [
              {
                text: t('OK'),
                action: () => {
                  if (goBack) {
                    navigation.goBack();
                  }
                },
                primary: true,
              },
            ],
      }),
    );
  };

  const getLinkedToWalletName = () => {
    if (!toWalletSelected) {
      return;
    }

    const linkedWallet = keys[toWalletSelected.keyId].wallets.find(({tokens}) =>
      tokens?.includes(toWalletSelected.id),
    );

    const walletName =
      linkedWallet?.walletName || linkedWallet?.credentials.walletName;
    return `${walletName}`;
  };

  const showTokensInfoSheet = () => {
    const linkedWalletName = getLinkedToWalletName();
    dispatch(
      AppActions.showBottomNotificationModal({
        type: 'info',
        title: t('Reminder'),
        message: t(
          'Keep in mind that once the funds are received in your wallet, to move them you will need to have enough funds in your Ethereum linked wallet to pay the ETH miner fees.',
          {
            selectedWallet:
              toWalletSelected?.currencyAbbreviation.toUpperCase(),
            linkedWalletName: linkedWalletName
              ? '(' + linkedWalletName + ')'
              : ' ',
          },
        ),
        enableBackdropDismiss: true,
        actions: [
          {
            text: t('GOT IT'),
            action: async () => {
              await sleep(400);
              continueToCheckout();
            },
            primary: true,
          },
        ],
      }),
    );
  };

  const checkIfErc20Token = () => {
    const tokensWarn = async () => {
      await sleep(300);
      showTokensInfoSheet();
    };
    if (
      !!toWalletSelected &&
      IsERCToken(toWalletSelected.currencyAbbreviation)
    ) {
      tokensWarn();
    } else {
      continueToCheckout();
    }
  };

  const continueToCheckout = () => {
    dispatch(
      logSegmentEvent('track', 'Requested Swap Crypto', {
        fromCoin: fromWalletSelected!.currencyAbbreviation,
        toCoin: toWalletSelected!.currencyAbbreviation,
        amountFrom: amountFrom,
        exchange: 'changelly',
      }),
    );
    navigation.navigate('SwapCrypto', {
      screen: 'ChangellyCheckout',
      params: {
        fromWalletSelected: fromWalletSelected!,
        toWalletSelected: toWalletSelected!,
        fromWalletData: fromWalletData!,
        toWalletData: toWalletData!,
        fixedRateId: rateData!.fixedRateId,
        amountFrom: amountFrom,
        useSendMax: IsERCToken(fromWalletSelected!.currencyAbbreviation)
          ? false
          : useSendMax,
        sendMaxInfo: sendMaxInfo,
      },
    });
  };

  const filterChangellyCurrenciesConditions = (
    currency: ChangellyCurrency,
  ): boolean => {
    // TODO: accept all Changelly supported tokens => If no wallets: create a custom token wallet
    const allSupportedTokens: string[] = [
      ...Object.keys(tokenOptions),
      ...SupportedEthereumTokens,
    ];
    return (
      currency.enabled &&
      currency.fixRateEnabled &&
      !!currency.protocol &&
      [...SupportedChains, 'erc20'].includes(
        // TODO: add matic
        currency.protocol.toLowerCase(),
      ) &&
      (['erc20', 'matic'].includes(currency.protocol.toLowerCase())
        ? allSupportedTokens.includes(
            getCurrencyAbbreviation(
              currency.name,
              getChainFromChangellyProtocol(currency.name, currency.protocol),
            ),
          )
        : true)
    );
  };

  const getChangellyCurrencies = async () => {
    const changellyCurrenciesData = await changellyGetCurrencies(true);

    if (changellyCurrenciesData?.result?.length) {
      const getLogoUri = (coin: string, _chain: string) => {
        if (
          SupportedCurrencyOptions.find(
            ({currencyAbbreviation, chain}) =>
              currencyAbbreviation === coin.toLowerCase() &&
              (!chain || chain === _chain),
          )
        ) {
          return SupportedCurrencyOptions.find(
            ({currencyAbbreviation, chain}) =>
              currencyAbbreviation === coin.toLowerCase() &&
              (!chain || chain === _chain),
          )!.img;
        } else if (tokenData[getCurrencyAbbreviation(coin, _chain)]?.logoURI) {
          return tokenData[getCurrencyAbbreviation(coin, _chain)]?.logoURI;
        } else {
          return undefined;
        }
      };

      const changellyCurrenciesDataFixedNames: ChangellyCurrency[] =
        getChangellyCurrenciesFixedProps(
          changellyCurrenciesData.result as ChangellyCurrency[],
        );

      const supportedCoinsWithFixRateEnabled: SwapCryptoCoin[] =
        changellyCurrenciesDataFixedNames
          .filter((changellyCurrency: ChangellyCurrency) =>
            filterChangellyCurrenciesConditions(changellyCurrency),
          )
          .map(
            ({
              name,
              fullName,
              protocol,
              contractAddress,
            }: {
              name: string;
              fullName: string;
              protocol?: string;
              contractAddress?: string;
            }) => {
              const chain = getChainFromChangellyProtocol(name, protocol);
              return {
                currencyAbbreviation: name,
                symbol: getCurrencyAbbreviation(name, chain),
                name: fullName,
                chain,
                protocol,
                logoUri: getLogoUri(name, chain),
                contractAddress,
              };
            },
          );

      // TODO: add support to float-rate coins supported by Changelly

      // Sort the array with our supported coins first and then the unsupported ones sorted alphabetically
      const orderedArray = SupportedCurrencyOptions.map(currency =>
        currency.chain
          ? getCurrencyAbbreviation(
              currency.currencyAbbreviation,
              currency.chain,
            )
          : currency.currencyAbbreviation,
      );
      let supportedCoins = orderBy(
        supportedCoinsWithFixRateEnabled,
        [
          coin => {
            return orderedArray.includes(coin.symbol)
              ? orderedArray.indexOf(coin.symbol)
              : orderedArray.length;
          },
          'name',
        ],
        ['asc', 'asc'],
      );

      if (supportedCoins.length === 0) {
        const msg = t(
          'Our partner Changelly is not currently available. Please try again later.',
        );
        showError(msg, undefined, undefined, true);
      }

      setSwapCryptoAllSupportedCoins(supportedCoins);

      const coinsToRemove =
        !countryData || countryData.shortCode === 'US' ? ['xrp'] : [];
      if (selectedWallet?.balance?.satSpendable === 0) {
        coinsToRemove.push(selectedWallet.currencyAbbreviation.toLowerCase());
      }
      if (coinsToRemove.length > 0) {
        logger.debug(
          `Removing ${JSON.stringify(
            coinsToRemove,
          )} from Changelly supported coins`,
        );
        supportedCoins = supportedCoins.filter(
          supportedCoin =>
            !coinsToRemove.includes(supportedCoin.currencyAbbreviation),
        );
      }

      setSwapCryptoSupportedCoinsFrom(supportedCoins);
    }
  };

  const init = async () => {
    try {
      dispatch(
        startOnGoingProcessModal(t(OnGoingProcessMessages.GENERAL_AWAITING)),
      );
      await Promise.all([getChangellyCurrencies(), sleep(400)]);
      dispatch(dismissOnGoingProcessModal());
    } catch (err) {
      logger.error('Changelly getCurrencies Error: ' + JSON.stringify(err));
      const msg = t(
        'Changelly is not available at this moment. Please try again later.',
      );
      dispatch(dismissOnGoingProcessModal());
      await sleep(200);
      showError(msg);
    }
  };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    setSelectedWallet();
  }, [swapCryptoSupportedCoinsFrom]);

  useEffect(() => {
    updateWalletData();
  }, [swapCryptoSupportedCoinsFrom, fromWalletSelected, toWalletSelected]);

  useEffect(() => {
    changellyGetPairParams();
  }, [fromWalletSelected, toWalletSelected]);

  useEffect(() => {
    updateReceivingAmount();
  }, [amountFrom]);

  return (
    <>
      <ScrollView>
        <SwapCryptoCard>
          <SummaryTitle>{t('From')}</SummaryTitle>
          {!fromWalletSelected && (
            <ActionsContainer>
              <SelectedOptionContainer
                style={{backgroundColor: Action}}
                disabled={swapCryptoSupportedCoinsFrom.length === 0}
                onPress={() => {
                  showModal('fromWalletSelector');
                }}>
                <SelectedOptionText
                  style={{color: White}}
                  numberOfLines={1}
                  ellipsizeMode={'tail'}>
                  {t('Select Wallet')}
                </SelectedOptionText>
                <SelectorArrowContainer>
                  <SelectorArrowDown
                    {...{width: 13, height: 13, color: White}}
                  />
                </SelectorArrowContainer>
              </SelectedOptionContainer>
            </ActionsContainer>
          )}
          {fromWalletSelected && (
            <>
              <ActionsContainer>
                <SelectedOptionContainer
                  style={{minWidth: 120}}
                  onPress={() => {
                    showModal('fromWalletSelector');
                  }}>
                  <SelectedOptionCol>
                    {fromWalletData ? (
                      <CoinIconContainer>
                        <CurrencyImage img={fromWalletData.logoUri} size={20} />
                      </CoinIconContainer>
                    ) : null}
                    <SelectedOptionText
                      numberOfLines={1}
                      ellipsizeMode={'tail'}>
                      {fromWalletSelected.walletName
                        ? fromWalletSelected.walletName
                        : fromWalletSelected.currencyName}
                    </SelectedOptionText>
                  </SelectedOptionCol>
                  <ArrowContainer>
                    <SelectorArrowDown
                      {...{
                        width: 13,
                        height: 13,
                        color: theme.dark ? White : SlateDark,
                      }}
                    />
                  </ArrowContainer>
                </SelectedOptionContainer>

                {toWalletSelected && (
                  <>
                    {!(amountFrom && amountFrom > 0) && !useSendMax ? (
                      <SelectedOptionContainer
                        style={{backgroundColor: Action}}
                        disabled={false}
                        onPress={() => {
                          showModal('amount');
                        }}>
                        <SelectedOptionCol>
                          <SelectedOptionText
                            style={{color: White}}
                            numberOfLines={1}
                            ellipsizeMode={'tail'}>
                            {t('Enter Amount')}
                          </SelectedOptionText>
                        </SelectedOptionCol>
                      </SelectedOptionContainer>
                    ) : (
                      <SelectedOptionCol>
                        <TouchableOpacity
                          onPress={() => {
                            showModal('amount');
                          }}>
                          {useSendMax ? (
                            <DataText style={{fontSize: 14}}>
                              {t('Maximum Amount')}
                            </DataText>
                          ) : (
                            <DataText>
                              {amountFrom && amountFrom > 0
                                ? amountFrom
                                : '0.00'}
                            </DataText>
                          )}
                        </TouchableOpacity>
                      </SelectedOptionCol>
                    )}
                  </>
                )}
              </ActionsContainer>
              {fromWalletSelected.balance?.cryptoSpendable ? (
                <ActionsContainer>
                  <BottomDataText>
                    {fromWalletSelected.balance.cryptoSpendable}{' '}
                    {fromWalletData?.currencyAbbreviation.toUpperCase()}{' '}
                    {t('available to swap')}
                  </BottomDataText>
                </ActionsContainer>
              ) : null}
            </>
          )}
        </SwapCryptoCard>

        <ArrowContainer>
          <ArrowDown />
        </ArrowContainer>

        <SwapCryptoCard>
          <SummaryTitle>{t('To')}</SummaryTitle>
          {!toWalletSelected && (
            <ActionsContainer>
              <SelectedOptionContainer
                style={{backgroundColor: Action}}
                disabled={!isToWalletEnabled()}
                onPress={() => {
                  if (!isToWalletEnabled()) {
                    return;
                  }
                  showModal('toWalletSelector');
                }}>
                <SelectedOptionText
                  style={{color: White}}
                  numberOfLines={1}
                  ellipsizeMode={'tail'}>
                  {t('Select Crypto')}
                </SelectedOptionText>
                <SelectorArrowContainer>
                  <SelectorArrowDown
                    {...{width: 13, height: 13, color: White}}
                  />
                </SelectorArrowContainer>
              </SelectedOptionContainer>
            </ActionsContainer>
          )}
          {toWalletSelected && (
            <>
              <ActionsContainer>
                <SelectedOptionContainer
                  style={{minWidth: 120}}
                  onPress={() => {
                    if (useDefaultToWallet || !isToWalletEnabled()) {
                      return;
                    }
                    showModal('toWalletSelector');
                  }}>
                  <SelectedOptionCol>
                    {toWalletData && (
                      <CoinIconContainer>
                        <CurrencyImage img={toWalletData.logoUri} size={20} />
                      </CoinIconContainer>
                    )}
                    <SelectedOptionText
                      numberOfLines={1}
                      ellipsizeMode={'tail'}>
                      {toWalletSelected.walletName
                        ? toWalletSelected.walletName
                        : toWalletSelected.currencyName}
                    </SelectedOptionText>
                  </SelectedOptionCol>
                  {!useDefaultToWallet && (
                    <ArrowContainer>
                      <SelectorArrowDown
                        {...{
                          width: 13,
                          height: 13,
                          color: theme.dark ? White : SlateDark,
                        }}
                      />
                    </ArrowContainer>
                  )}
                </SelectedOptionContainer>
                {rateData?.amountTo && !loading && (
                  <SelectedOptionCol>
                    <DataText>{rateData?.amountTo}</DataText>
                  </SelectedOptionCol>
                )}
                {!rateData?.amountTo && loading && (
                  <SpinnerContainer>
                    <ActivityIndicator color={ProgressBlue} />
                  </SpinnerContainer>
                )}
              </ActionsContainer>
              {rateData?.rate && (
                <ActionsContainer alignEnd={true}>
                  <BottomDataText>
                    1 {fromWalletData?.currencyAbbreviation.toUpperCase()} ~{' '}
                    {rateData?.rate}{' '}
                    {toWalletData?.currencyAbbreviation.toUpperCase()}
                  </BottomDataText>
                </ActionsContainer>
              )}
            </>
          )}
        </SwapCryptoCard>

        <CtaContainer>
          <Button
            buttonStyle={'primary'}
            disabled={!canContinue()}
            onPress={() => {
              checkIfErc20Token();
            }}>
            {t('Continue')}
          </Button>
        </CtaContainer>
        <ProviderContainer>
          <ProviderLabel>{t('Provided By')}</ProviderLabel>
          <ChangellyLogo width={100} height={30} />
        </ProviderContainer>
      </ScrollView>

      <FromWalletSelectorModal
        isVisible={fromWalletSelectorModalVisible}
        customSupportedCurrencies={swapCryptoSupportedCoinsFrom}
        livenetOnly={true}
        modalContext={'send'}
        modalTitle={t('Swap From')}
        onDismiss={(fromWallet: Wallet) => {
          hideModal('fromWalletSelector');
          if (fromWallet?.currencyAbbreviation) {
            setFromWallet(fromWallet);
          }
        }}
      />

      <ToWalletSelectorModal
        isVisible={toWalletSelectorModalVisible}
        customSupportedCurrencies={swapCryptoSupportedCoinsTo}
        livenetOnly={true}
        modalTitle={t('Swap To')}
        onDismiss={async (
          toWallet?: Wallet,
          createToWalletData?: AddWalletData,
        ) => {
          hideModal('toWalletSelector');
          if (toWallet?.currencyAbbreviation) {
            setToWallet(toWallet);
          } else if (createToWalletData) {
            try {
              if (createToWalletData.key.isPrivKeyEncrypted) {
                logger.debug('Key is Encrypted. Trying to decrypt...');
                await sleep(500);
                const password = await dispatch(
                  getDecryptPassword(createToWalletData.key),
                );
                createToWalletData.options.password = password;
              }

              await sleep(500);
              await dispatch(
                startOnGoingProcessModal(
                  t(OnGoingProcessMessages.ADDING_WALLET),
                ),
              );

              const createdToWallet = await dispatch(
                addWallet(createToWalletData),
              );
              logger.debug(
                `Added ${createdToWallet?.currencyAbbreviation} wallet from Swap Crypto`,
              );
              dispatch(
                logSegmentEvent('track', 'Created Basic Wallet', {
                  coin: createToWalletData.currency.currencyAbbreviation,
                  isErc20Token: createToWalletData.currency.isToken,
                  context: 'swapCrypto',
                }),
              );
              setToWallet(createdToWallet);
              await sleep(300);
              dispatch(dismissOnGoingProcessModal());
            } catch (err: any) {
              dispatch(dismissOnGoingProcessModal());
              await sleep(500);
              if (err.message === 'invalid password') {
                dispatch(showBottomNotificationModal(WrongPasswordError()));
              } else {
                showError(err.message);
              }
            }
          }
        }}
      />

      <AmountModal
        isVisible={amountModalVisible}
        modalTitle={t('Swap Amount')}
        swapOpts={{
          // @ts-ignore
          maxWalletAmount:
            fromWalletSelected?.balance?.cryptoSpendable?.replaceAll(',', ''),
          swapLimits,
        }}
        cryptoCurrencyAbbreviation={fromWalletData?.currencyAbbreviation.toUpperCase()}
        chain={fromWalletData?.chain}
        onClose={() => hideModal('amount')}
        onSubmit={newAmount => {
          hideModal('amount');
          setUseSendMax(false);
          setSendMaxInfo(undefined);
          setAmountFrom(newAmount);
        }}
        onSendMaxPressed={async () => {
          hideModal('amount');

          if (!fromWalletSelected) {
            return;
          }

          let newAmount: number | undefined;

          if (IsERCToken(fromWalletSelected.currencyAbbreviation)) {
            setUseSendMax(true);
            setSendMaxInfo(undefined);
            newAmount = Number(
              // @ts-ignore
              fromWalletSelected.balance.cryptoSpendable.replaceAll(',', ''),
            );
          } else {
            setUseSendMax(true);
            const data = await getSendMaxData();
            setSendMaxInfo(data);
            if (data?.amount) {
              newAmount = dispatch(
                SatToUnit(
                  data.amount,
                  fromWalletSelected.currencyAbbreviation,
                  fromWalletSelected.chain,
                ),
              );
            }
          }

          if (newAmount) {
            setAmountFrom(newAmount);
          }
        }}
      />
    </>
  );
};

export default SwapCryptoRoot;
