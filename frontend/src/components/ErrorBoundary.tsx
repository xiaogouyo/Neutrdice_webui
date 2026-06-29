import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Page error:', error, errorInfo);
    const info = errorInfo as { componentStack?: string };
    this.setState({
      errorInfo: info?.componentStack || ''
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">页面加载异常</h1>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-mono break-all">
              {this.state.error?.message || '未知错误'}
            </p>
            {this.state.error?.stack && (
              <details className="mt-2 text-xs text-gray-500 font-mono">
                <summary className="cursor-pointer">堆栈信息</summary>
                <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: '' })}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children as JSX.Element;
  }
}
