import React from 'react';
import {Alert, Linking} from 'react-native';
import {StackScreenProps} from '@react-navigation/stack';
import {useAppSelector} from '../utils/hooks';
import {LogLevel} from '../store/log/log.models';
import {RootStackParamList} from '../Root';
import {RootState} from '../store';
import {BaseText} from '../components/styled/Text';
import styled from 'styled-components/native';
import {Caution, SlateDark, White} from '../styles/colors';
import Button from '../components/button/Button';
import {APP_VERSION} from '../constants/config';

export type DebugScreenParamList =
  | {
      name: string | undefined | null;
    }
  | undefined;

const DebugContainer = styled.SafeAreaView`
  flex: 1;
`;

const ButtonContainer = styled.View`
  padding: 20px 15px;
`;

const ScrollView = styled.ScrollView`
  margin: 20px 15px;
`;

const TitleError = styled(BaseText)`
  font-size: 18px;
  font-weight: bold;
  color: ${({theme: {dark}}) => (dark ? White : SlateDark)};
  padding: 50px 15px 8px 15px;
`;

const DescriptionError = styled(BaseText)`
  font-size: 14px;
  color: ${Caution};
  padding: 0 15px;
`;

const LogError = styled(BaseText)`
  font-size: 14px;
  color: ${({theme: {dark}}) => (dark ? '#E1E4E7' : SlateDark)};
`;

const DebugScreen: React.FC<StackScreenProps<RootStackParamList, 'Debug'>> = ({
  route,
}) => {
  const logs = useAppSelector(({LOG}: RootState) => LOG.logs);
  const {name} = route.params || {};

  let logStr: string =
    'Session Logs.\nBe careful, this could contain sensitive private data\n\n';
  logStr += '\n\n';

  const filteredLogs = logs
    .filter(log => log.level <= LogLevel.Debug)
    .map(log => {
      const formattedLevel = LogLevel[log.level].toLowerCase();

      const output = `[${formattedLevel}] ${log.message}\n`;
      logStr += output;
      return output;
    });

  const handleEmail = (data: string) => {
    Linking.openURL(
      `mailto:?subject=BitPay v${APP_VERSION} Logs&body=${data}`,
    ).catch(error => {
      console.error('Error sending email: ' + error);
    });
  };

  const showDisclaimer = (data: string) => {
    Alert.alert(
      'Warning',
      'Be careful, this could contain sensitive private data.',
      [{text: 'Continue', onPress: () => handleEmail(data)}, {text: 'Cancel'}],
      {cancelable: true},
    );
  };

  return (
    <DebugContainer>
      <TitleError>Oops, something went wrong.</TitleError>
      <DescriptionError>{name}</DescriptionError>
      <ScrollView>
        <LogError>{filteredLogs}</LogError>
      </ScrollView>
      <ButtonContainer>
        <Button onPress={() => showDisclaimer(logStr)}>
          Send Logs By Email
        </Button>
      </ButtonContainer>
    </DebugContainer>
  );
};

export default DebugScreen;
