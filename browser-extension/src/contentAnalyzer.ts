

/**
 * ============================================
 * CONTENT ANALYZER - FOR GENERAL WEB USE
 * ============================================
 * 
 * Analyzes page content and provides suggestions
 * Works on YouTube, Twitter, Reddit, etc.
 */

interface PageContext {
  url: string;
  domain: string;
  pageType: 'youtube' | 'twitter' | 'reddit' | 'news' | 'general' | 'unknown';
  content: string;
  title: string;
  metadata: any;
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  questions: string[];
}

/**
 * Detect page type and analyze content
 */
export function analyzePageContent(): PageContext {
  const url = window.location.href;
  const domain = new URL(url).hostname;
  const title = document.title;
  let pageType: PageContext['pageType'] = 'unknown';
  let content = '';
  let metadata: any = {};

  // Detect page type
  if (domain.includes('youtube.com')) {
    pageType = 'youtube';
    content = analyzeYouTube();
    metadata = extractYouTubeMetadata();
  } else if (domain.includes('twitter.com') || domain.includes('x.com')) {
    pageType = 'twitter';
    content = analyzeTwitter();
    metadata = extractTwitterMetadata();
  } else if (domain.includes('reddit.com')) {
    pageType = 'reddit';
    content = analyzeReddit();
    metadata = extractRedditMetadata();
  } else if (domain.includes('news') || domain.includes('medium.com')) {
    pageType = 'news';
    content = analyzeNews();
    metadata = extractNewsMetadata();
  } else {
    pageType = 'general';
    content = analyzeGeneralPage();
  }

  return {
    url,
    domain,
    pageType,
    content,
    title,
    metadata,
  };
}

/**
 * Analyze YouTube content
 */
function analyzeYouTube(): string {
  try {
    // Get current video title
    const videoTitle = document.querySelector('h1.title')?.textContent || '';
    
    // Get video description
    const description = document.querySelector('yt-formatted-string.content')?.textContent || '';
    
    // Get recommended videos
    const recommendations = Array.from(
      document.querySelectorAll('a#thumbnail')
    )
      .slice(0, 5)
      .map((el) => el.getAttribute('title'))
      .filter(Boolean)
      .join('\n');

    return `
Video: ${videoTitle}
Description: ${description}
Recommended Videos:
${recommendations}
    `;
  } catch (error) {
    console.error('Error analyzing YouTube:', error);
    return '';
  }
}

/**
 * Extract YouTube metadata
 */
function extractYouTubeMetadata(): any {
  try {
    const videoTitle = document.querySelector('h1.title')?.textContent || 'Unknown';
    const channelName = document.querySelector('ytd-channel-name a')?.textContent || 'Unknown';
    const viewCount = document.querySelector('yt-formatted-string.view-count')?.textContent || '0';
    
    // Get current video link
    const videoLink = window.location.href;
    
    // Get recommendations
    const recommendedVideos = Array.from(
      document.querySelectorAll('a#thumbnail')
    )
      .slice(0, 5)
      .map((el) => ({
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
      }))
      .filter((v) => v.title);

    return {
      videoTitle,
      channelName,
      viewCount,
      videoLink,
      recommendedVideos,
    };
  } catch (error) {
    return {};
  }
}

/**
 * Analyze Twitter content
 */
function analyzeTwitter(): string {
  try {
    const tweets = Array.from(document.querySelectorAll('article'))
      .slice(0, 3)
      .map((article) => {
        const text = article.querySelector('[lang]')?.textContent || '';
        const author = article.querySelector('[data-testid="User-Name"]')?.textContent || '';
        return `${author}: ${text}`;
      })
      .join('\n\n');

    return `Recent tweets:\n${tweets}`;
  } catch (error) {
    return '';
  }
}

/**
 * Extract Twitter metadata
 */
function extractTwitterMetadata(): any {
  return {
    platform: 'Twitter',
    trendingTopics: getTrendingTopics(),
  };
}

/**
 * Get trending topics from Twitter
 */
function getTrendingTopics(): string[] {
  try {
    return Array.from(document.querySelectorAll('[data-testid="trend"]'))
      .slice(0, 5)
      .map((el) => el.textContent || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Analyze Reddit content
 */
function analyzeReddit(): string {
  try {
    const postTitle = document.querySelector('h1')?.textContent || '';
    const postContent = document.querySelector('[data-testid="post-content"]')?.textContent || '';
    const comments = Array.from(document.querySelectorAll('[data-testid="comment"]'))
      .slice(0, 3)
      .map((c) => c.textContent)
      .join('\n\n');

    return `
Post: ${postTitle}
Content: ${postContent}
Top Comments:
${comments}
    `;
  } catch (error) {
    return '';
  }
}

/**
 * Extract Reddit metadata
 */
function extractRedditMetadata(): any {
  return {
    subreddit: window.location.pathname.split('/')[2],
    upvotes: document.querySelector('[data-testid="upvote"]')?.getAttribute('aria-label'),
  };
}

/**
 * Analyze news page
 */
function analyzeNews(): string {
  try {
    const headline = document.querySelector('h1')?.textContent || '';
    const articleBody = document.querySelector('article')?.textContent?.slice(0, 500) || '';
    const relatedArticles = Array.from(document.querySelectorAll('a[href*="article"]'))
      .slice(0, 5)
      .map((a) => a.textContent)
      .join('\n');

    return `
Headline: ${headline}
Article: ${articleBody}
Related Articles:
${relatedArticles}
    `;
  } catch (error) {
    return '';
  }
}

/**
 * Extract news metadata
 */
function extractNewsMetadata(): any {
  return {
    source: new URL(window.location.href).hostname,
    publishedTime: document.querySelector('time')?.getAttribute('datetime'),
  };
}

/**
 * Analyze general page
 */
function analyzeGeneralPage(): string {
  try {
    const title = document.title;
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const headings = Array.from(document.querySelectorAll('h1, h2'))
      .slice(0, 5)
      .map((h) => h.textContent)
      .join('\n');

    return `
Title: ${title}
Description: ${description}
Headings:
${headings}
    `;
  } catch (error) {
    return '';
  }
}

/**
 * Generate suggestions based on page content
 */
export function generateSuggestions(context: PageContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  switch (context.pageType) {
    case 'youtube':
      suggestions.push(...generateYouTubeSuggestions(context));
      break;

    case 'twitter':
      suggestions.push(...generateTwitterSuggestions(context));
      break;

    case 'reddit':
      suggestions.push(...generateRedditSuggestions(context));
      break;

    case 'news':
      suggestions.push(...generateNewsSuggestions(context));
      break;

    default:
      suggestions.push(...generateGeneralSuggestions(context));
  }

  return suggestions;
}

/**
 * YouTube suggestions
 */
function generateYouTubeSuggestions(context: PageContext): Suggestion[] {
  return [
    {
      id: 'yt-1',
      title: 'Find Similar Videos',
      description: 'Get more videos like this one',
      icon: '🎬',
      category: 'youtube',
      questions: [
        'What other videos are similar to this?',
        'Can you recommend channels with similar content?',
        'What topics are related to this video?',
      ],
    },
    {
      id: 'yt-2',
      title: 'Video Summary',
      description: 'Get a quick summary of the video',
      icon: '📝',
      category: 'youtube',
      questions: [
        'What is the main topic of this video?',
        'Can you summarize the key points?',
        'What should I take away from this?',
      ],
    },
    {
      id: 'yt-3',
      title: 'Learning Path',
      description: 'Create a learning path from this video',
      icon: '📚',
      category: 'youtube',
      questions: [
        'What should I learn next after this video?',
        'What prerequisites do I need for this topic?',
        'Can you suggest a learning roadmap?',
      ],
    },
  ];
}

/**
 * Twitter suggestions
 */
function generateTwitterSuggestions(context: PageContext): Suggestion[] {
  return [
    {
      id: 'tw-1',
      title: 'Sentiment Analysis',
      description: 'Analyze sentiment of tweets',
      icon: '💭',
      category: 'twitter',
      questions: [
        'What is the overall sentiment of this tweet?',
        'Is this positive or negative?',
        'What emotions does this convey?',
      ],
    },
    {
      id: 'tw-2',
      title: 'Trending Topics',
      description: 'Explain trending topics',
      icon: '🔥',
      category: 'twitter',
      questions: [
        'What are the top trending topics right now?',
        'Why is this topic trending?',
        'What is the context behind this trend?',
      ],
    },
    {
      id: 'tw-3',
      title: 'Fact Check',
      description: 'Verify tweet information',
      icon: '✅',
      category: 'twitter',
      questions: [
        'Is this information accurate?',
        'Can you fact-check this claim?',
        'What are other perspectives on this?',
      ],
    },
  ];
}

/**
 * Reddit suggestions
 */
function generateRedditSuggestions(context: PageContext): Suggestion[] {
  return [
    {
      id: 'rd-1',
      title: 'Discussion Summary',
      description: 'Summarize the discussion',
      icon: '💬',
      category: 'reddit',
      questions: [
        'What is this discussion about?',
        'What are the main viewpoints?',
        'What can I learn from this thread?',
      ],
    },
    {
      id: 'rd-2',
      title: 'Community Insights',
      description: 'Get insights from the community',
      icon: '👥',
      category: 'reddit',
      questions: [
        'What does this community care about?',
        'What are common recommendations?',
        'What best practices are discussed?',
      ],
    },
  ];
}

/**
 * News suggestions
 */
function generateNewsSuggestions(context: PageContext): Suggestion[] {
  return [
    {
      id: 'news-1',
      title: 'Article Summary',
      description: 'Get a quick summary',
      icon: '📖',
      category: 'news',
      questions: [
        'What is the main news?',
        'Can you summarize this article?',
        'What are the key facts?',
      ],
    },
    {
      id: 'news-2',
      title: 'Context & Background',
      description: 'Understand the context',
      icon: '🔍',
      category: 'news',
      questions: [
        'What is the background of this story?',
        'Why is this news important?',
        'What led to this event?',
      ],
    },
  ];
}

/**
 * General suggestions
 */
function generateGeneralSuggestions(context: PageContext): Suggestion[] {
  return [
    {
      id: 'gen-1',
      title: 'Page Summary',
      description: 'Summarize this page',
      icon: '📄',
      category: 'general',
      questions: [
        'What is this page about?',
        'Can you summarize this content?',
        'What are the main points?',
      ],
    },
    {
      id: 'gen-2',
      title: 'Explain Concepts',
      description: 'Explain difficult concepts',
      icon: '💡',
      category: 'general',
      questions: [
        'Can you explain this in simpler terms?',
        'What does this mean?',
        'Can you break this down?',
      ],
    },
  ];
}
