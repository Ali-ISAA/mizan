# Mizan AI Chat Components

This directory contains the chat interface components for the Mizan AI compliance assistant. These components provide contextual AI assistance for document analysis, compliance guidance, and legal support.

## Components Overview

### 1. ChatInterface
**Purpose**: Document-specific chat interface for analyzing uploaded documents
**Use Case**: Used within the document detail view for document-specific queries

```tsx
import { ChatInterface } from '@/components/chat';

<ChatInterface
  document={documentData}
  isMinimized={false}
  onMinimize={() => setMinimized(true)}
  onMaximize={() => setMinimized(false)}
  onClose={() => setChatOpen(false)}
/>
```

**Features**:
- Document-aware responses
- Clause-specific analysis
- Compliance issue identification
- Related clause highlighting
- Confidence scoring

### 2. GeneralChatInterface
**Purpose**: General compliance guidance and support
**Use Case**: Used as a floating assistant on dashboard and other pages

```tsx
import { GeneralChatInterface } from '@/components/chat';

<GeneralChatInterface
  isMinimized={isMinimized}
  onMinimize={() => setMinimized(true)}
  onMaximize={() => setMinimized(false)}
  onClose={() => setChatOpen(false)}
  title="Mizan Compliance Assistant"
/>
```

**Features**:
- General compliance guidance
- Regulatory framework explanations
- Best practices recommendations
- Risk assessment guidance

### 3. FloatingChatButton
**Purpose**: Entry point for chat interactions
**Use Case**: Floating button that provides easy access to AI assistance

```tsx
import { FloatingChatButton } from '@/components/chat';

<FloatingChatButton
  onOpenChat={() => setIsChatOpen(true)}
  showNotification={hasNewMessages}
  notificationCount={unreadCount}
/>
```

**Features**:
- Hover tooltip with AI capabilities
- Notification badges
- Smooth animations
- Pulse effects for active state

### 4. ChatMessage
**Purpose**: Individual message display component
**Use Case**: Renders user and AI messages with appropriate formatting

**Features**:
- User/AI message differentiation
- Timestamp display
- Copy to clipboard functionality
- Confidence indicators
- Suggested follow-up questions
- Related clause indicators

### 5. ComplianceTemplates
**Purpose**: Pre-built question templates for compliance topics
**Use Case**: Quick-start questions tailored to document types

**Features**:
- Document-type filtering
- Categorized templates (analysis, improvement, explanation, risk)
- Visual category indicators
- Responsive grid layout

## Integration Guide

### Adding Chat to a New Page

1. **Import the components**:
```tsx
import { FloatingChatButton, GeneralChatInterface } from '@/components/chat';
```

2. **Add state management**:
```tsx
const [isChatOpen, setIsChatOpen] = useState(false);
const [isChatMinimized, setIsChatMinimized] = useState(false);
```

3. **Add the components**:
```tsx
{/* Floating button when chat is closed */}
{!isChatOpen && (
  <FloatingChatButton
    onOpenChat={() => setIsChatOpen(true)}
  />
)}

{/* Chat interface when open */}
{isChatOpen && (
  <GeneralChatInterface
    isMinimized={isChatMinimized}
    onMinimize={() => setIsChatMinimized(true)}
    onMaximize={() => setIsChatMinimized(false)}
    onClose={() => {
      setIsChatOpen(false);
      setIsChatMinimized(false);
    }}
  />
)}
```

### Document-Specific Chat

For document analysis pages, use the `ChatInterface` instead:

```tsx
import { ChatInterface } from '@/components/chat';

<ChatInterface
  document={documentData}
  isMinimized={isMinimized}
  onMinimize={() => setIsMinimized(true)}
  onMaximize={() => setIsMinimized(false)}
  onClose={() => setIsChatOpen(false)}
/>
```

## AI Response Generation

The chat components include intelligent response generation based on:

### Document-Specific Responses
- **Compliance Analysis**: Identifies issues by severity
- **Clause Explanations**: Breaks down complex legal language
- **Improvement Suggestions**: Provides actionable recommendations
- **Risk Assessment**: Highlights potential legal exposures

### General Compliance Responses
- **Regulatory Frameworks**: GDPR, Saudi law, industry standards
- **Best Practices**: Implementation guidance
- **Risk Management**: Assessment methodologies
- **Legal Requirements**: Jurisdiction-specific compliance

## Customization

### Adding New Templates
Edit `ComplianceTemplates.tsx` to add new question templates:

```tsx
{
  id: 'new-template',
  title: 'New Question Type',
  question: 'What should I ask about?',
  category: 'analysis', // analysis | improvement | explanation | risk
  icon: YourIcon,
  description: 'Description of what this template does',
  documentTypes: ['Contract', 'Policy'] // optional filtering
}
```

### Styling Customization
Components use Tailwind CSS classes and can be customized via:
- Component props for behavioral changes
- CSS classes for visual modifications
- Theme variables for consistent coloring

### Response Customization
Modify the response generation functions in:
- `ChatInterface.tsx` → `generateComplianceResponse()`
- `GeneralChatInterface.tsx` → `generateGeneralResponse()`

## Types

All shared types are defined in `types.ts`:
- `Message`: Chat message structure
- `ComplianceTemplate`: Template configuration
- `DocumentData`: Document structure for analysis

## Features

### Smart Response Generation
- Context-aware responses based on document content
- Compliance framework knowledge
- Jurisdiction-specific guidance
- Industry best practices

### User Experience
- Minimizable/maximizable interface
- Floating access button
- Suggested follow-up questions
- Copy-to-clipboard functionality
- Confidence indicators
- Related content linking

### Accessibility
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management

## Future Enhancements

Planned improvements include:
- Integration with real AI/LLM backends
- Conversation persistence
- Advanced document parsing
- Multi-language support
- Voice interaction capabilities
- Advanced analytics and insights
