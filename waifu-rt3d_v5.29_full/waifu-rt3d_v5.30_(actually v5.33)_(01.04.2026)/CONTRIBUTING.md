# Contributing to waifu-rt3d

Thank you for your interest in contributing to waifu-rt3d! This document provides guidelines and instructions for contributing.

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards others

## 🐛 Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment details** (OS, Python version, etc.)
- **Logs or error messages**
- **Screenshots** if applicable

## 💡 Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature is already in the [ROADMAP](ROADMAP.md)
- Open an issue with the `enhancement` label
- Describe the feature clearly
- Explain the use case and benefits
- Consider implementation complexity

## 🔧 Development Setup

### Prerequisites
- Python 3.8 or higher
- Git
- LM Studio (for testing LLM integration)

### Setup Steps

1. **Fork and clone the repository**
```bash
git clone https://github.com/yourusername/waifu-rt3d.git
cd waifu-rt3d
```

2. **Install dependencies**
```bash
# macOS/Linux
./install.sh

# Windows
install.bat
```

3. **Run tests**
```bash
source .venv/bin/activate  # macOS/Linux
pytest tests/ -v
```

4. **Run the development server**
```bash
./run.sh  # macOS/Linux
# or
run.bat  # Windows
```

## 📝 Code Style

### Python
- Follow PEP 8 style guide
- Use type hints where possible
- Keep functions small and focused
- Add docstrings to classes and functions

**Example:**
```python
def my_function(param: str) -> dict:
    """
    Brief description of function.

    Args:
        param: Description of parameter

    Returns:
        Description of return value
    """
    pass
```

### JavaScript
- Use ES6+ features
- Use `const` and `let` (not `var`)
- Use arrow functions where appropriate
- Keep functions pure when possible

### Formatting
We recommend using:
- **Python**: `black` for formatting, `pylint` for linting
- **JavaScript**: `prettier` for formatting, `eslint` for linting

## 🧪 Testing

### Writing Tests

- Add tests for all new features
- Ensure tests are isolated and repeatable
- Use meaningful test names
- Mock external dependencies

**Test Structure:**
```python
class TestMyFeature:
    """Test suite for my feature"""

    def test_successful_case(self):
        """Test that normal operation works"""
        # Arrange
        # Act
        # Assert
        pass

    def test_error_case(self):
        """Test that errors are handled properly"""
        pass
```

### Running Tests
```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_adapters.py -v

# Run with coverage
pytest tests/ --cov=backend --cov-report=html
```

## 📦 Pull Request Process

### Before Submitting

1. **Create a feature branch**
```bash
git checkout -b feature/my-awesome-feature
```

2. **Make your changes**
   - Write clear, concise commit messages
   - Keep commits atomic (one logical change per commit)
   - Add tests for new functionality

3. **Test your changes**
```bash
pytest tests/ -v
python backend/preflight.py  # Test initialization
```

4. **Update documentation**
   - Update README.md if adding features
   - Update CHANGELOG.md
   - Add docstrings to new code
   - Update ROADMAP.md if completing roadmap items

### Submitting

1. **Push to your fork**
```bash
git push origin feature/my-awesome-feature
```

2. **Create Pull Request**
   - Use a clear, descriptive title
   - Reference related issues
   - Describe what changed and why
   - Include screenshots for UI changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123

## Testing
- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass locally
```

## 🎯 Areas for Contribution

### High Priority
- ASR (speech-to-text) implementation
- Avatar animation/lip sync
- Character profile system
- UI improvements

### Good First Issues
Look for issues labeled `good first issue` or `help wanted`

### Documentation
- Improve existing docs
- Add tutorials
- Create video guides
- Translate documentation

## 🏗️ Architecture Guidelines

### Adding New Adapters

#### LLM Adapter
```python
# backend/llm/adapters/myprovider.py
from .base import LLMAdapter

class MyProviderAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key, **kwargs) -> dict:
        # Implementation
        return {'ok': True, 'reply': response_text}
```

#### TTS Adapter
```python
# backend/tts/adapters/myprovider.py
from .base import TTSAdapter

class MyProviderAdapter(TTSAdapter):
    def speak(self, text: str, tts_cfg: dict) -> dict:
        # Generate audio
        filename = self._mk_name(cache_key, extension)
        (self.audio_dir / filename).write_bytes(audio_data)
        return {'ok': True, 'filename': filename, 'meta': {...}}
```

### Database Changes

If you need to modify the database schema:

1. Create a new migration script in `backend/db/`
2. Update `schema_v3.sql` (or create v4)
3. Update `preflight.py` to handle migrations
4. Document the change in CHANGELOG.md

## 📋 Commit Message Guidelines

Use conventional commit format:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**
```
feat(tts): add Google Cloud TTS adapter

fix(server): handle connection timeouts gracefully

docs(readme): update installation instructions for Windows
```

## 🎨 UI/UX Contributions

When contributing UI changes:

- Maintain dark theme consistency
- Ensure responsive design
- Test on multiple browsers
- Consider accessibility
- Update CSS variables in `theme.css`

## 🔒 Security

- Never commit API keys or secrets
- Sanitize all user inputs
- Use parameterized SQL queries
- Validate file uploads
- Follow OWASP guidelines

If you discover a security vulnerability, please email [security@example.com] instead of opening an issue.

## 📞 Getting Help

- Join our Discord: [link]
- Check the [docs](docs/)
- Ask in GitHub Discussions
- Tag maintainers in issues

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to waifu-rt3d!
