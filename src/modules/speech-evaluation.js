/**
 * 腾讯云口语评测模块
 * 使用腾讯云 SOE (Smart Oral Evaluation) 服务进行口语评分
 *
 * 使用前需要安装依赖: npm install tencentcloud-sdk-nodejs-soe --save
 * 需要配置环境变量:
 * - TENCENT_SECRET_ID: 腾讯云 SecretId
 * - TENCENT_SECRET_KEY: 腾讯云 SecretKey
 *
 * 注意：如果 SDK 未安装或凭证未配置，将自动降级为模拟评分模式
 */

// 动态导入腾讯云 SDK
let SoeClient = null;

const loadTencentCloudSdk = async () => {
  if (SoeClient) {
    return SoeClient;
  }

  try {
    const tencentcloud = await import('tencentcloud-sdk-nodejs-soe');
    // SDK 导出结构: tencentcloud.soe.v20180724.Client
    const soeModule = tencentcloud.soe || tencentcloud;
    const versionModule = soeModule.v20180724 || soeModule;
    SoeClient = versionModule.Client;
    return SoeClient;
  } catch (error) {
    console.error('腾讯云 SDK 加载失败，请确保已安装 tencentcloud-sdk-nodejs-soe:', error.message);
    return null;
  }
};

/**
 * 获取腾讯云 SDK 凭证
 */
const getTencentCloudCredentials = () => {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    return null;
  }

  return { secretId, secretKey };
};

/**
 * 创建腾讯云 SOE 客户端
 */
const createSoeClient = async () => {
  const ClientClass = await loadTencentCloudSdk();
  if (!ClientClass) {
    return null;
  }

  const credentials = getTencentCloudCredentials();
  if (!credentials) {
    return null;
  }

  const clientConfig = {
    credential: {
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
    },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'soe.tencentcloudapi.com',
      },
    },
  };

  return new ClientClass(clientConfig);
};

/**
 * 一站式口语评测
 * 直接传入参考文本和音频数据，返回评分结果
 *
 * @param {string} refText - 参考文本（用户需要朗读的文本）
 * @param {string} voiceDataBase64 - Base64 编码的音频数据
 * @param {object} options - 可选参数
 * @param {number} options.workMode - 工作模式: 1-流式, 2-一次性
 * @param {number} options.evalMode - 评估模式: 0-单词, 1-句子, 2-段落
 * @param {number} options.scoreCoeff - 评分苛刻度: 1.0-10.0
 * @param {number} options.voiceEncodeType - 音频编码: 1-pcm, 2-wav, 3-mp3, 4-ogg
 * @param {number} options.voiceFileType - 音频文件类型: 1-原始音频, 2-识别音频
 * @returns {Promise<{score: number, pronunciation: number, fluency: number, integrity: number}>}
 */
const evaluateOral = async (refText, voiceDataBase64, options = {}) => {
  const {
    workMode = 1,     // 一次性评测
    evalMode = 1,     // 句子模式
    scoreCoeff = 1.0,
    voiceEncodeType = 3, // mp3
    voiceFileType = 1,
  } = options;

  const client = await createSoeClient();

  if (!client) {
    console.warn('腾讯云口语评测服务未配置，使用模拟评分');
    return generateMockScore();
  }

  try {
    const params = {
      SeqId: 1,
      IsEnd: 1,
      VoiceFileType: voiceFileType,
      VoiceEncodeType: voiceEncodeType,
      UserVoiceData: voiceDataBase64,
      SessionId: `study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      RefText: refText,
      WorkMode: workMode,
      EvalMode: evalMode,
      ScoreCoeff: scoreCoeff,
      ServerType: 1, // 1-英文
    };

    const response = await client.TransOralProcess(params);

    // 解析评分结果
    const result = {
      score: Math.round(response.PronAccuracy || 0),
      pronunciation: Math.round(response.PronAccuracy || 0),
      fluency: Math.round(response.PronFluency || 0),
      integrity: Math.round(response.PronCompletion || 0),
      words: [],
    };

    // 解析单词级别的评分
    if (response.Words && Array.isArray(response.Words)) {
      result.words = response.Words.map((word) => ({
        word: word.Word || word.ReferenceWord,
        score: Math.round(word.PronAccuracy || 0),
        referenceWord: word.ReferenceWord,
      }));
    }

    return result;
  } catch (error) {
    console.error('口语评测失败:', error);
    throw new Error(`口语评测失败: ${error.message}`);
  }
};

/**
 * 生成模拟评分（当 SDK 未配置时使用）
 */
const generateMockScore = () => {
  const baseScore = Math.floor(Math.random() * 25) + 70;
  return {
    score: baseScore,
    pronunciation: Math.min(100, baseScore + Math.floor(Math.random() * 10) - 3),
    fluency: Math.min(100, baseScore + Math.floor(Math.random() * 10) - 3),
    integrity: Math.min(100, baseScore + Math.floor(Math.random() * 10) - 3),
    words: [],
    isMock: true,
  };
};

/**
 * 检查口语评测服务是否可用
 */
const checkSpeechEvaluationAvailable = async () => {
  const credentials = getTencentCloudCredentials();
  if (!credentials) {
    return { available: false, reason: '未配置腾讯云凭证 (TENCENT_SECRET_ID / TENCENT_SECRET_KEY)' };
  }

  const ClientClass = await loadTencentCloudSdk();
  if (!ClientClass) {
    return { available: false, reason: '腾讯云 SDK 未安装 (npm install tencentcloud-sdk-nodejs-soe)' };
  }

  return { available: true, reason: null };
};

/**
 * 注册口语评测路由
 */
export const registerSpeechEvaluationRoutes = async ({ app }) => {
  console.log('🎤 口语评测模块: 初始化中...');

  // 检查服务可用性
  const availability = await checkSpeechEvaluationAvailable();
  if (!availability.available) {
    console.warn(`🎤 口语评测模块: 服务不可用 - ${availability.reason}`);
    console.warn('🎤 口语评测模块: 将使用模拟评分模式');
  } else {
    console.log('🎤 口语评测模块: 腾讯云口语评测服务已就绪');
  }

  /**
   * POST /api/speech-evaluation/evaluate
   * 口语评测接口
   *
   * 请求体:
   * - refText: 参考文本（用户需要朗读的文本）
   * - audioBase64: Base64 编码的音频数据
   * - options: 可选参数 (workMode, evalMode, scoreCoeff)
   */
  app.post('/api/speech-evaluation/evaluate', async (req, res) => {
    try {
      const { refText, audioBase64, options } = req.body;

      if (!refText) {
        return res.status(400).json({
          success: false,
          error: '缺少参考文本 (refText)',
        });
      }

      if (!audioBase64) {
        return res.status(400).json({
          success: false,
          error: '缺少音频数据 (audioBase64)',
        });
      }

      const result = await evaluateOral(refText, audioBase64, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('口语评测接口错误:', error);
      res.status(500).json({
        success: false,
        error: error.message || '口语评测失败',
      });
    }
  });

  /**
   * GET /api/speech-evaluation/status
   * 检查口语评测服务状态
   */
  app.get('/api/speech-evaluation/status', async (req, res) => {
    const availability = await checkSpeechEvaluationAvailable();
    res.json({
      success: true,
      data: {
        available: availability.available,
        reason: availability.reason,
        mode: availability.available ? 'tencent-cloud' : 'mock',
      },
    });
  });

  console.log('🎤 口语评测模块: 路由注册完成');
};

export default {
  registerSpeechEvaluationRoutes,
  evaluateOral,
  checkSpeechEvaluationAvailable,
};
