


import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { throttle } from 'lodash';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { v4 as uuid } from 'uuid';

import html2canvas from 'html2canvas';

import html2pdf from 'html2pdf-jspdf2';

import '@fortawesome/fontawesome-free/css/all.min.css';

import styles from '@/styles/Home.module.scss';

import IndexHeader from './components/IndexHeader';

import HeadMeatSetup from './components/HeadMetaSetup';

import MessageItem from './components/MessageItem';
import AvatarUploader from './components/AvatarUploader';

import HistoryTopicList from './components/HistoryTopicList';

import {
    chatWithGptTurbo,
    chatWithGptTurboByProxy,
    generateImageWithText,
    getCurrentApiKeyBilling,
} from '../open.ai.service';

import { Theme, SystemSettingMenu, ERole, IMessage } from '../interface';

import { ChatService } from '../db';

import {
    dataURItoBlob,
    ThemeLocalKey,
    UserAvatarLocalKey,
    RobotAvatarLocalKey,
    SystemRoleLocalKey,
    APIKeyLocalKey,
    GenerateImagePromptPrefix,
} from '../utils';




const chatDB = new ChatService();

const SystemMenus = [
    {
        label: '机器人头像设置',
        value: SystemSettingMenu.robotAvatarSettings,
    },
    {
        label: '用户头像设置',
        value: SystemSettingMenu.userAvatarSettings,
    },
    {
        label: '系统角色设置',
        value: SystemSettingMenu.systemRoleSettings,
    },
    {
        label: '接口密钥设置',
        value: SystemSettingMenu.apiKeySettings,
    },
];

export default function Home() {
    const windowState = useRef({
        isMobile: false,
        windowHeight: 0,
        virtualKeyboardVisible: false,
        isUsingComposition: false,
    });

    useEffect(() => {
        const isMobile =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                window.navigator.userAgent
            );
        windowState.current.isMobile = isMobile;
        windowState.current.windowHeight = window.innerHeight;
        const handleWindowResize = () => {
            windowState.current.virtualKeyboardVisible =
                window.innerHeight < windowState.current.windowHeight;
        };
        window.addEventListener('resize', handleWindowResize);

        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, []);

    const [theme, setTheme] = useState<Theme>('light');
    const updateTheme = useCallback((theme: Theme) => {
        setTheme(theme);
    }, []);

    const [maskVisible, setMaskVisible] = useState(false);
    const showMask = useCallback(() => {
        setMaskVisible(true);
    }, []);
    const hideMask = useCallback(() => {
        setMaskVisible(false);
    }, []);

    const [tempSystemRoleValue, setTempSystemRoleValue] = useState('');

    const [systemMenuVisible, setSystemMenuVisible] = useState(false);
    const toggleSystemMenuVisible = useCallback(() => {
        setSystemMenuVisible((visible) => !visible);
    }, []);

    const [activeSystemMenu, setActiveSystemMenu] = useState<
        SystemSettingMenu | ''
    >('');

    const [tempApiKeyValue, setTempApiKeyValue] = useState(
        typeof window !== 'undefined' ? window.localStorage.getItem(APIKeyLocalKey) || '' : ''
    );
    const [apiKey, setApiKey] = useState('');

    const [currentApiKeyBilling, setCurrentApiKeyBilling] = useState({
        totalGranted: 0,
        totalAvailable: 0,
        totalUsed: 0,
    });

    useEffect(() => {
        if (!apiKey) return;
        getCurrentApiKeyBilling(apiKey).then((res) => {
            if (res.total_granted) {
                setCurrentApiKeyBilling({
                    totalGranted: res.total_granted,
                    totalAvailable: res.total_available,
                    totalUsed: res.total_used,
                });
            }
        });
    }, [apiKey]);

    const chatHistoryEle = useRef<HTMLDivElement | null>(null);

    const convertToPDF = () => {
        if (messageList.length === 0) {
            toast.warn('没有可生成的问答内容', {
                autoClose: 1000,
            });
            return;
        }
        setMaskVisible(true);
        const element = chatHistoryEle.current;
        if (!element) return;

        const pdfPageWidth = element.clientWidth;

        const pdfPageHeight = element.scrollHeight;

        const opt = {
            margin: [0, 0, 0, 0],
            filename: `${new Date().getTime().toFixed(10)}myfile.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                width: pdfPageWidth,
                height: pdfPageHeight,
            },
            jsPDF: {
                unit: 'pt',
                format: 'a4',
                orientation: 'portrait',
            },
        };
        html2pdf().from(element).set(opt).save();
        setMaskVisible(false);
    };

    const convertToImage = () => {
        if (messageList.length === 0) {
            toast.warn('没有可生成的问答内容', {
                autoClose: 1000,
            });
            return;
        }
        setMaskVisible(true);
        const messageEleList =
            document.querySelector('#chatHistory')?.childNodes;

        if (!messageEleList) return;
        if (!messageEleList.length) return;
        const promises: Promise<HTMLCanvasElement>[] = Array.from(
            messageEleList
        ).map((item) => {
            return html2canvas(item as HTMLElement);
        });

        Promise.all(promises).then((canvases) => {
            let canvasWidth = 0,
                canvasHeight = 0;
            canvases.forEach((canvas) => {
                canvasWidth = Math.max(canvasWidth, canvas.width);
                canvasHeight += canvas.height;
            });

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvasWidth;
            finalCanvas.height = canvasHeight;

            const context = finalCanvas.getContext('2d');
            if (!context) return;

            let offsetY = 0;
            canvases.forEach((canvas) => {
                if (canvas.width > 0) {
                    context.drawImage(canvas, 0, offsetY);
                    offsetY += canvas.height - 2;
                }
            });

            const imageData = finalCanvas.toDataURL('image/png');

            const blob = dataURItoBlob(imageData);

            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = `${new Date()
                .getTime()
                .toFixed(10)}dialog_list.png`;

            downloadLink.click();
            setMaskVisible(false);
        });
    };

    const [systemRole, setSystemRole] = useState<IMessage>({
        role: ERole.system,
        content: '',
        id: uuid(),
        createdAt: Date.now(),
    });

    const [messageList, setMessageList] = useState<IMessage[]>([]);

    const removeMessageById = useCallback((id: string) => {
        setMessageList((list) => list.filter((item) => item.id !== id));
    }, []);

    const updateCurrentMessageList = useCallback((messages: IMessage[]) => {
        setMessageList(messages);
    }, []);

    const [currentUserMessage, setCurrentUserMessage] = useState('');
    const userPromptRef = useRef<HTMLTextAreaElement | null>(null);

    const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');

    const [loading, setLoading] = useState(false);

    const controller = useRef<AbortController | null>(null);

    const scrollSmoothThrottle = throttle(
        () => {
            if (!chatHistoryEle.current) return;
            chatHistoryEle.current.scrollTo({
                top: chatHistoryEle.current.scrollHeight,
                behavior: 'smooth',
            });
        },
        300,
        {
            leading: true,
            trailing: false,
        }
    );

    const [serviceErrorMessage, setServiceErrorMessage] = useState('');

    const apiRequestRateLimit = useRef({
        maxRequestsPerMinute: 10,
        requestsThisMinute: 0,
        lastRequestTime: 0,
    });

    const chatGPTTurboWithLatestUserPrompt = async (isRegenerate = false) => {
        // api request rate limit
        const now = Date.now();
        if (now - apiRequestRateLimit.current.lastRequestTime >= 60000) {
            apiRequestRateLimit.current.requestsThisMinute = 0;
            apiRequestRateLimit.current.lastRequestTime = 0;
        }
        if (
            apiRequestRateLimit.current.requestsThisMinute >=
            apiRequestRateLimit.current.maxRequestsPerMinute
        ) {
            toast.warn(`Api Requests are too frequent, try again later! `);
            return;
        }

        if (!apiKey) {
            toast.error('Please set API KEY', {
                autoClose: 3000,
            });
            setSystemMenuVisible(true);
            setActiveSystemMenu(SystemSettingMenu.apiKeySettings);
            return;
        }

        // 先把用户输入信息展示到对话列表
        if (!isRegenerate && !currentUserMessage) {
            toast.warn('请输入你的问题', { autoClose: 1000 });
            return;
        }

        const newMessageList = messageList.concat([]);
        if (!isRegenerate) {
            const newUserMessage = {
                role: ERole.user,
                content: currentUserMessage,
                id: uuid(),
                createdAt: Date.now(),
            };
            newMessageList.push(newUserMessage);
            if (activeTopicId) {
                // 更新
                chatDB.addConversation({
                    topicId: activeTopicId,
                    ...newUserMessage,
                });
            }
        }

        // 取出最近的3条messages，作为上下文
        const len = newMessageList.length;
        const latestMessageLimit3 = newMessageList.filter(
            (_, idx) => idx >= len - 4
        );
        if (!latestMessageLimit3.some((item) => item.role === ERole.system)) {
            // system role setting
            latestMessageLimit3.unshift(
                systemRole.content
                    ? systemRole
                    : {
                          role: ERole.system,
                          content:
                              'You are a versatile expert, please answer each of my questions in a simple and easy-to-understand way as much as possible',
                          id: systemRole.id,
                          createdAt: systemRole.createdAt,
                      }
            );
        }

        setMessageList(newMessageList);
        setCurrentUserMessage('');
        if (!userPromptRef.current) return;
        userPromptRef.current.style.height = 'auto';
        scrollSmoothThrottle();

        const prompt =
            latestMessageLimit3?.[latestMessageLimit3.length - 1]?.content ||
            '';

        const isGenerateImage =
            prompt?.startsWith(GenerateImagePromptPrefix) || false;

        try {
            setServiceErrorMessage('');
            setLoading(true);
            controller.current = new AbortController();

            let response: Response;
            if (isGenerateImage) {
                response = await generateImageWithText(
                    apiKey,
                    prompt,
                    controller.current
                );
            } else {
                // user api key
                response = await chatWithGptTurbo(
                    apiKey,
                    latestMessageLimit3,
                    controller.current
                );
            }

            apiRequestRateLimit.current.requestsThisMinute += 1;

            if (!response.ok) {
                throw new Error(response.statusText);
            }
            if (isGenerateImage) {
                const generateImgInfo = await response.json();
                archiveCurrentMessage(generateImgInfo?.data?.[0]?.url);
                setTimeout(() => {
                    scrollSmoothThrottle();
                }, 2000);
            } else {
                const data = response.body;
                if (!data) {
                    throw new Error('No Data');
                }
                const reader = data.getReader();
                const decoder = new TextDecoder('utf-8');
                let newCurrentAssistantMessage = '';
                // 循环读取数据
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    // 处理读取到的数据块
                    if (value) {
                        let char = decoder.decode(value);
                        if (
                            char === `\n` &&
                            newCurrentAssistantMessage.endsWith(`\n`)
                        ) {
                            continue;
                        }
                        if (char) {
                            newCurrentAssistantMessage += char;
                            setCurrentAssistantMessage(
                                newCurrentAssistantMessage
                            );
                        }
                        scrollSmoothThrottle();
                    }
                }
                archiveCurrentMessage(newCurrentAssistantMessage);
            }
            setLoading(false);
        } catch (error: any) {
            setLoading(false);
            controller.current = null;
            setServiceErrorMessage(error?.error?.message || 'Service Error');
        }
    };

    const archiveCurrentMessage = (newCurrentAssistantMessage: string) => {
        if (newCurrentAssistantMessage) {
            const newAssistantMessage = {
                role: ERole.assistant,
                content: newCurrentAssistantMessage,
                id: uuid(),
                createdAt: Date.now(),
            };
            setMessageList((list) => list.concat([newAssistantMessage]));
            if (activeTopicId) {
                // 更新
                chatDB.addConversation({
                    topicId: activeTopicId,
                    ...newAssistantMessage,
                });
            }
            setLoading(false);
            controller.current = null;
            setCurrentUserMessage('');
            setCurrentAssistantMessage('');
            scrollSmoothThrottle();
        }
    };

    // 头像
    const [robotAvatar, setRobotAvatar] = useState<string>('/robot.png');

    const updateRobotAvatar = (img: string) => {
        setRobotAvatar(img);
        setActiveSystemMenu('');
        setSystemMenuVisible(false);
        window.localStorage.setItem(RobotAvatarLocalKey, img);
    };

    const [userAvatar, setUserAvatar] = useState<string>('/fox.png');

    const updateUserAvatar = (img: string) => {
        setUserAvatar(img);
        setActiveSystemMenu('');
        setSystemMenuVisible(false);
        window.localStorage.setItem(UserAvatarLocalKey, img);
    };

    useEffect(() => {
        const light_gpt_theme =
            window.localStorage.getItem(ThemeLocalKey) || 'light';
        setTheme(light_gpt_theme as Theme);
        const light_gpt_user_avatar =
            window.localStorage.getItem(UserAvatarLocalKey) || '/fox.png';
        setUserAvatar(light_gpt_user_avatar);
        const light_gpt_robot_avatar =
            window.localStorage.getItem(RobotAvatarLocalKey) || '/robot.png';
        setRobotAvatar(light_gpt_robot_avatar);
        const light_gpt_system_role =
            window.localStorage.getItem(SystemRoleLocalKey) || '';
        if (light_gpt_system_role !== '') {
            setSystemRole({
                role: ERole.system,
                content: light_gpt_system_role,
                id: uuid(),
                createdAt: Date.now(),
            });
        }
        const light_gpt_api_key =
            window.localStorage.getItem(APIKeyLocalKey) || '';
        if (light_gpt_api_key !== '') {
            // 不显示设置过的api_key
            setApiKey(light_gpt_api_key);
        }
    }, []);

    const [activeTopicId, setActiveTopicId] = useState('');
    const changeActiveTopicId = useCallback((id: string) => {
        setActiveTopicId(id);
    }, []);

    const [historyTopicListVisible, setHistoryDialogueListVisible] =
        useState(true);

    const toggleHistoryTopicListVisible = useCallback(() => {
        setHistoryDialogueListVisible((visible) => !visible);
    }, []);

    // const [tempApiKeyValue, setTempApiKeyValue] = useState('');
    const [isApiKeyEditable, setIsApiKeyEditable] = useState(false);
    const [password, setPassword] = useState('');

    return (
        <div id="app" className={styles.app} data-theme={theme}>
            <HeadMeatSetup></HeadMeatSetup>

            <ToastContainer></ToastContainer>

            {/** 历史对话记录 */}
            <div
                className={`${styles.historyTopicListContainer} ${
                    !historyTopicListVisible && styles.hide
                }`}
            >
                <HistoryTopicList
                    historyTopicListVisible={historyTopicListVisible}
                    toggleHistoryTopicListVisible={
                        toggleHistoryTopicListVisible
                    }
                    currentMessageList={messageList}
                    updateCurrentMessageList={updateCurrentMessageList}
                    activeTopicId={activeTopicId}
                    changeActiveTopicId={changeActiveTopicId}
                    showMask={showMask}
                    hideMask={hideMask}
                />
            </div>

            <div
                className={`${styles.systemSettingMenus} ${
                    systemMenuVisible && styles.show
                }`}
            >
                {SystemMenus.map((menu) => (
                    <div
                        key={menu.value}
                        className={styles.menu}
                        onClick={() => {
                            setActiveSystemMenu(menu.value);
                        }}
                    >
                        {menu.label}
                    </div>
                ))}
            </div>
            <div className={styles.header}>
                <IndexHeader
                    apiKey={apiKey}
                    theme={theme}
                    updateTheme={updateTheme}
                    toggleSystemMenuVisible={toggleSystemMenuVisible}
                />
            </div>
            <div className={styles.main}>
                <div
                    id="chatHistory"
                    className={styles.chatHistory}
                    ref={(e) => (chatHistoryEle.current = e)}
                >
                    {messageList
                        .filter((item) => item.role !== ERole.system)
                        .map((item) => (
                            <MessageItem
                                key={item.id}
                                id={item.id}
                                role={item.role}
                                avatar={
                                    item.role === ERole.user
                                        ? userAvatar
                                        : robotAvatar
                                }
                                message={item.content}
                                removeMessageById={removeMessageById}
                            />
                        ))}
                    {loading && currentAssistantMessage.length > 0 && (
                        <MessageItem
                            id={uuid()}
                            role={ERole.assistant}
                            avatar={robotAvatar}
                            message={currentAssistantMessage}
                        />
                    )}
                    <div className={styles.placeholder}>
                        <div className={styles.child}></div>
                    </div>
                </div>
            </div>
            <div className={styles.footer}>
                {serviceErrorMessage !== '' && (
                    <div className={styles.openAiServiceError}>
                        {serviceErrorMessage}
                    </div>
                )}

                <div className={styles.action}></div>
                <div className={styles.middle}>
                    <div className={styles.textareaContainer}>
                        {/** mobile regenerate and stop action */}
                        <div className={styles.mobileAction}>
                            {loading ? (
                                <div
                                    className={styles.btn}
                                    onClick={() => {
                                        if (controller.current) {
                                            controller.current.abort();
                                            setLoading(false);
                                            archiveCurrentMessage(
                                                currentAssistantMessage
                                            );
                                        }
                                    }}
                                >
                                    Stop
                                </div>
                            ) : (
                                <div
                                    className={styles.btn}
                                    onClick={() =>
                                        chatGPTTurboWithLatestUserPrompt(true)
                                    }
                                >
                                    Regenerate
                                </div>
                            )}
                        </div>


                        <textarea
                            className={styles.userPrompt}
                            onChange={(e) => {
                                setCurrentUserMessage(e.target.value);
                            }}
                            onInput={() => {
                                if (
                                    userPromptRef.current &&
                                    userPromptRef.current.scrollHeight > 50
                                ) {
                                    userPromptRef.current.style.height =
                                        userPromptRef.current.scrollHeight +
                                        2 +
                                        'px';
                                }
                            }}
                            value={currentUserMessage}
                            ref={(e) => {
                                userPromptRef.current = e;
                            }}
                            placeholder={
                                loading
                                    ? 'ai is thinking...'
                                    : '输入任何文本像AI提问或者输入 img-此处填写您对生成图片的要求 (如：img-美女)'
                            }
                            rows={1}
                            onKeyDown={(event) => {
                                // event.key 的值不受操作系统和键盘布局的影响，它始终表示按下的是哪个字符键。
                                // pc端
                                if (
                                    !windowState.current.isMobile &&
                                    (event.code === 'Enter' ||
                                        event.code === 'Done')
                                ) {
                                    event.preventDefault();
                                    if (windowState.current.isUsingComposition)
                                        return;
                                    chatGPTTurboWithLatestUserPrompt(false);
                                }
                                // 移动端
                                if (
                                    windowState.current.isMobile &&
                                    (event.key === 'Enter' ||
                                        event.key === 'Done')
                                ) {
                                    (
                                        document.activeElement as HTMLElement
                                    ).blur();
                                }
                            }}
                            onBlur={() => {
                                if (windowState.current.isMobile) {
                                    chatGPTTurboWithLatestUserPrompt(false);
                                }
                            }}
                            onCompositionStart={(e) => {
                                windowState.current.isUsingComposition = true;
                            }}
                            onCompositionEnd={(e) => {
                                windowState.current.isUsingComposition = false;
                            }}
                        />
                        <div className={styles.submit}>
                            {loading ? (
                                <div className={styles.spinner}></div>
                            ) : (
                                <i
                                    className="fas fa-paper-plane"
                                    style={{ transform: 'scale(1.2)' }}
                                    onClick={() =>
                                        chatGPTTurboWithLatestUserPrompt(false)
                                    }
                                ></i>
                            )}
                        </div>
                    </div>
                    <div className={styles.siteDescription}>
                        <span>Made by zxd</span>
                        <span>｜</span>
                        <span>玩得愉快</span>
                    </div>
                </div>
                <div className={styles.action}>
                    {loading ? (
                        <div
                            className={styles.btn}
                            onClick={() => {
                                if (controller.current) {
                                    controller.current.abort();
                                    setLoading(false);
                                    archiveCurrentMessage(
                                        currentAssistantMessage
                                    );
                                }
                            }}
                        >
                            Stop
                        </div>
                    ) : (
                        <div
                            className={styles.btn}
                            onClick={() =>
                                chatGPTTurboWithLatestUserPrompt(true)
                            }
                        >
                            Regenerate
                        </div>
                    )}
                </div>
            </div>
            <div
                className={`${styles.extraFunction} ${
                    !messageList.length && styles.noMessage
                }`}
            >
                <i className="fas fa-image" onClick={convertToImage}></i>
                <i className="fas fa-file-pdf" onClick={convertToPDF}></i>
                <i
                    className="fas fa-trash-alt"
                    onClick={() => {
                        if (messageList.length === 0) {
                            toast.warn(
                                '没有可生成的问答内容',
                                { autoClose: 1000 }
                            );
                            return;
                        }
                        setMessageList([]);
                    }}
                ></i>
            </div>

            <div
                className={`${styles.modal} ${
                    !activeSystemMenu && styles.hide
                }`}
            >
                <div className={styles.modalContent}>
                    <i
                        className={`fas fa-times ${styles.closeIcon}`}
                        onClick={() => {
                            setActiveSystemMenu('');
                        }}
                    ></i>
                    {activeSystemMenu ===
                        SystemSettingMenu.robotAvatarSettings && (
                        <AvatarUploader
                            title="Robot Avatar Settings"
                            img={robotAvatar}
                            updateAvatar={updateRobotAvatar}
                        />
                    )}
                    {activeSystemMenu ===
                        SystemSettingMenu.userAvatarSettings && (
                        <AvatarUploader
                            title="User Avatar Settings"
                            img={userAvatar}
                            updateAvatar={updateUserAvatar}
                        />
                    )}
                    {activeSystemMenu ===
                        SystemSettingMenu.systemRoleSettings && (
                        <div className={styles.systemRoleSettings}>
                            <label htmlFor="systemRole">System Role</label>
                            <textarea
                                placeholder="在此输入你想要系统扮演的角色"
                                id="systemRole"
                                value={tempSystemRoleValue}
                                rows={4}
                                onChange={(e) => {
                                    setTempSystemRoleValue(e.target.value);
                                }}
                            ></textarea>

                            <div className={styles.description}>
                                系统角色是指生成文本中的角色标识，可以是不同的角色、机器人或其他实体。通过设置不同的系统角色，可以控制生成文本的情绪和语气，更好地适应特定场景的需求.
                            </div>

                            {/*<div className={styles.benefits}>*/}
                            {/*    Do not know how to define system role? Come{' '}*/}
                            {/*    <Link*/}
                            {/*        href="https://github.com/f/awesome-chatgpt-prompts"*/}
                            {/*        target="_blank"*/}
                            {/*    >*/}
                            {/*        Awesome ChatGPT Prompts*/}
                            {/*    </Link>{' '}*/}
                            {/*    to choose the system role you want*/}
                            {/*</div>*/}
                            <div className={styles.btnContainer}>
                                <button
                                    className={styles.saveButton}
                                    onClick={() => {
                                        setActiveSystemMenu('');
                                        setSystemMenuVisible(false);
                                        setSystemRole({
                                            role: ERole.system,
                                            content: tempSystemRoleValue,
                                            id: uuid(),
                                            createdAt: systemRole.createdAt,
                                        });
                                        window.localStorage.setItem(
                                            ThemeLocalKey,
                                            tempSystemRoleValue
                                        );
                                        toast.success('Successful update', {
                                            autoClose: 1000,
                                        });
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    )}
                    {activeSystemMenu === SystemSettingMenu.apiKeySettings && (
                        <div className={styles.systemRoleSettings}>
                            <label htmlFor="apiKey">Open AI API Key</label>
                            <input
                                placeholder="输入你的open ai api key"
                                id="apiKey"
                                value={tempApiKeyValue}
                                onChange={(e) => {
                                    setTempApiKeyValue(e.target.value);
                                }}
                                disabled={true}
                            ></input>
                            {!isApiKeyEditable && (
                                <>
                                    <div className={styles.description}>
                                        请输入密码以获取 API Key：
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    ></input>
                                    <button
                                        className={styles.saveButton}
                                        onClick={() => {
                                            if (password === '123') {
                                                setIsApiKeyEditable(true);
                                                setTempApiKeyValue('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');
                                                setPassword('');
                                                toast.success('密码正确', { autoClose: 1000 });
                                                window.localStorage.setItem(APIKeyLocalKey, tempApiKeyValue);
                                            } else {
                                                setTempApiKeyValue('');
                                                setPassword('');
                                                toast.error('密码错误', { autoClose: 1000 });
                                            }
                                        }}
                                    >
                                        确定
                                    </button>
                                </>
                            )}

                            <div className={styles.description}>
                                请输入您的API密钥，这将确保您的助手运行得更快更好.
                                <strong>
                                    请放心，您输入的API密钥不会上传到我们的服务器，只会存储在您的浏览器本地，没有泄露风险。我们将尽最大努力保护您的隐私和数据安全。
                                </strong>
                            </div>

                            {/*<div className={styles.benefits}>*/}
                                {/*不知道如何获取您的 api 密钥？If you have*/}
                                {/*a Open AI account, please visit{' '}*/}
                                {/*<Link*/}
                                {/*    href="https://platform.openai.com/account/api-keys"*/}
                                {/*    target="_blank"*/}
                                {/*>*/}
                                {/*    Open AI Platform API keys*/}
                                {/*</Link>{' '}*/}
                                {/*to to view your API key list.If you do not have*/}
                                {/*a chatGPT account, please click the button below*/}
                                {/*to get a temporary API key, which may have slow*/}
                                {/*access speed. Therefore, to ensure faster*/}
                                {/*conversation, please use your own API key as*/}
                                {/*much as possible.*/}
                            {/*</div>*/}
                            <div className={styles.btnContainer}>
                                <button
                                    className={styles.saveButton}
                                    onClick={() => {
                                        setActiveSystemMenu('');
                                        setSystemMenuVisible(false);
                                        setApiKey(tempApiKeyValue);
                                        window.localStorage.setItem(
                                            APIKeyLocalKey,
                                            tempApiKeyValue
                                        );
                                        toast.success('Successful update', {
                                            autoClose: 1000,
                                        });
                                    }}
                                    disabled={!isApiKeyEditable}
                                >
                                    保存
                                </button>
                                {/* <button
                                    className={styles.saveButton}
                                    onClick={() => {

                                        setActiveSystemMenu('');
                                    }}
                                >
                                    Get API Key
                                </button> */}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/** 生成图片、pdf的简单loading */}
            {maskVisible && (
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner}></div>
                </div>
            )}
        </div>
    );
}
