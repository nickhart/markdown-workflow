---
title: '{{title}}'
author: '{{user.name}}'
date: '{{date}}'
theme: 'technical'
---

# {{title}}

Welcome to markdown-workflow presentations! This beginner template shows you all the essential features for creating professional technical presentations.

---

## Getting Started

This presentation demonstrates:

- **Simple slide layouts** with markdown
- **PlantUML diagrams** for technical content
- **Professional formatting** with reference templates
- **Multiple output formats** (PPTX, HTML, PDF)

Let's explore each feature step by step.

---

## Basic Slide Elements

### Text Formatting

You can use standard markdown formatting:

- **Bold text** for emphasis
- _Italic text_ for subtle emphasis
- `Code snippets` for technical terms
- [Links](https://example.com) for references

### Lists and Structure

1. **Ordered lists** for step-by-step content
2. **Bullet points** for feature lists
3. **Nested items** for detailed breakdowns
   - Sub-item A
   - Sub-item B
   - Sub-item C

---

## Simple Flow Diagrams

Perfect for showing processes and decision flows:

```plantuml:simple-flow
@startuml
!theme plain
skinparam defaultFontSize 14

start
:User opens application;
if (Authenticated?) then (yes)
  :Load dashboard;
  :Display user data;
else (no)
  :Show login form;
  :Validate credentials;
  if (Valid?) then (yes)
    :Create session;
    :Redirect to dashboard;
  else (no)
    :Show error message;
    stop
  endif
endif
:User interacts with app;
stop
@enduml
```

This diagram shows a typical user authentication flow.

---

## System Architecture Diagrams

Great for showing how components interact:

```plantuml:system-architecture
@startuml
!theme plain
skinparam componentStyle rectangle
skinparam defaultFontSize 12

package "Frontend" {
  [React App] as frontend
  [State Management] as state
  [UI Components] as ui
}

package "Backend Services" {
  [API Gateway] as gateway
  [Authentication Service] as auth
  [Business Logic] as logic
  [File Storage] as storage
}

package "Data Layer" {
  database "PostgreSQL" as db
  database "Redis Cache" as cache
  cloud "AWS S3" as s3
}

' Connections
frontend --> gateway : HTTPS
gateway --> auth : validate
gateway --> logic : process
logic --> db : query
logic --> cache : cache
storage --> s3 : files
state --> frontend : updates
ui --> frontend : render

note right of gateway
  API Gateway handles
  all external requests
  and routing
end note

@enduml
```

---

## Sequence Diagrams

Perfect for showing interactions over time:

```plantuml:user-interaction
@startuml
!theme plain
skinparam defaultFontSize 12

actor User
participant "Web App" as Web
participant "API Server" as API
participant "Database" as DB
participant "Email Service" as Email

User -> Web: Click "Register"
Web -> API: POST /api/register
API -> DB: Check if user exists
DB -> API: User not found
API -> DB: Create new user
DB -> API: User created
API -> Email: Send welcome email
Email -> API: Email queued
API -> Web: Registration successful
Web -> User: Show success message
User -> Web: Click confirmation link
Web -> API: POST /api/confirm
API -> DB: Update user status
DB -> API: Status updated
API -> Web: Account confirmed
Web -> User: Redirect to dashboard

note over User, Email
  Complete user registration flow
  with email confirmation
end note

@enduml
```

---

## Class Diagrams

Show object relationships and structure:

```plantuml:class-structure
@startuml
!theme plain
skinparam defaultFontSize 11

class User {
  -id: string
  -email: string
  -password: string
  -createdAt: Date
  +login(): boolean
  +logout(): void
  +updateProfile(): void
}

class Profile {
  -userId: string
  -firstName: string
  -lastName: string
  -avatar: string
  +getFullName(): string
  +updateAvatar(): void
}

class Post {
  -id: string
  -authorId: string
  -title: string
  -content: string
  -publishedAt: Date
  +publish(): void
  +edit(): void
  +delete(): void
}

class Comment {
  -id: string
  -postId: string
  -authorId: string
  -content: string
  -createdAt: Date
  +edit(): void
  +delete(): void
}

User ||--|| Profile : has
User ||--o{ Post : creates
Post ||--o{ Comment : contains
User ||--o{ Comment : writes

note top of User
  Main user entity with
  authentication methods
end note

@enduml
```

---

## Two-Column Layouts

For comparing concepts or showing before/after:

:::: {.columns}
::: {.column width="50%"}

### Before Implementation

- Manual processes
- Email-based workflows
- Spreadsheet tracking
- No real-time updates
- Limited collaboration

**Problems:**

- Data inconsistency
- Process delays
- Human errors
  :::

::: {.column width="50%"}

### After Implementation

- Automated workflows
- Real-time notifications
- Centralized dashboard
- Live collaboration
- Audit trails

**Benefits:**

- 90% faster processing
- Zero data entry errors
- Complete visibility
  :::
  ::::

---

## Code Examples

You can include code snippets with syntax highlighting:

```typescript
// Example API endpoint
export async function createPresentation(title: string, template: string): Promise<Presentation> {
  const collection = await workflowEngine.createCollection('presentation', { title, template });

  // Generate diagrams
  await plantumProcessor.processMarkdown(collection.content, collection.assetsDir);

  return {
    id: collection.id,
    title: collection.metadata.title,
    status: collection.metadata.status,
  };
}
```

---

## Network Diagrams

Show infrastructure and connections:

```plantuml:network-topology
@startuml
!theme plain
skinparam defaultFontSize 12

cloud "Internet" as internet
node "Load Balancer" as lb
node "Web Server 1" as web1
node "Web Server 2" as web2
node "Application Server" as app
database "Primary DB" as db1
database "Replica DB" as db2
storage "File Storage" as files

internet --> lb : HTTPS
lb --> web1 : HTTP
lb --> web2 : HTTP
web1 --> app : API calls
web2 --> app : API calls
app --> db1 : Read/Write
app --> db2 : Read only
app --> files : Assets

note right of lb
  Distributes traffic
  across web servers
end note

note bottom of db1
  Master database
  handles all writes
end note

@enduml
```

---

## Tips for Great Presentations

### Content Structure

1. **Start with an overview** - Tell them what you'll tell them
2. **Use diagrams liberally** - Pictures are worth 1000 words
3. **Keep slides focused** - One main idea per slide
4. **End with next steps** - Give clear action items

### Technical Diagrams

- **Flow diagrams** for processes and workflows
- **Sequence diagrams** for time-based interactions
- **Class diagrams** for object relationships
- **Architecture diagrams** for system overviews

### Workflow Commands

```bash
# Create new presentation
wf create presentation "My Topic" beginner

# Generate diagrams and slides
wf format presentation my_topic_20250731

# Update status when ready
wf status presentation my_topic_20250731 published

# Commit your work
wf commit presentation my_topic_20250731
```

---

## Next Steps

1. **Customize this template** for your specific content
2. **Add your own diagrams** using PlantUML syntax
3. **Generate PPTX files** with `wf format`
4. **Share and collaborate** using version control

### Resources

- **PlantUML Documentation**: [plantuml.com](https://plantuml.com)
- **Markdown Guide**: Standard markdown syntax
- **Workflow Commands**: Use `wf --help` for all options

---

# Questions?

**Contact:** {{user.email}}  
**Created with:** markdown-workflow  
**Date:** {{date}}

_Thank you for using markdown-workflow presentations!_
