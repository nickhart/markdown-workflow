# Web Demo MVP Concept

## Goal
Create a minimal web demo to showcase the markdown-workflow system for blog posts. Keep it **extremely simple** following our ADR 002 principle.

## Demo Features (Super Simple)

### 1. Configuration & Template Editor
- **Big Text Fields:**
  - YAML config editor (user info, company, role)
  - Resume template editor (markdown with mustache variables)
  - Cover letter template editor (markdown with mustache variables)
- **Live Preview:** Show variable substitution as you type
- **Submit Button:** "Generate Collection"

### 2. Generated Files Page
- **File List:** Show all generated files with clear explanations
  - `resume_john_doe.md` - "Your personalized resume"
  - `cover_letter_john_doe.md` - "Your customized cover letter"  
  - `collection.yml` - "Metadata and tracking information"
- **File Preview:** Click to view file contents in modal/panel
- **Download:** Single "Download ZIP" button
- **Zip Contents:** All files in folder named `company_role_20241125/`

## Technical Implementation

### Keep It Simple
```typescript
// Reuse existing core modules
import { TemplateProcessor } from '../src/core/TemplateProcessor';
import { WorkflowEngine } from '../src/core/WorkflowEngine';

// Mock filesystem using existing test utilities
import { createMockFileSystem } from '../tests/helpers/FileSystemHelpers';
```

### Architecture
- **Frontend:** Simple React components (or plain HTML/JS)
- **No Backend:** Everything runs client-side
- **Mock Data:** Use in-memory collections, no real file system
- **Deployment:** Static site (Vercel, Netlify, GitHub Pages)

### Page Structure
```
/demo
├── template-playground/    # Interactive template editor
├── workflow-viz/          # Status flow visualization  
├── collection-list/       # Example application listing
└── about/                # Link to blog post/GitHub
```

## Implementation Plan (1-2 days max)

### Day 1: Core Demo
- [ ] Set up Next.js page in existing project
- [ ] Create simple form for user input (name, company, role)
- [ ] Import and use existing TemplateProcessor
- [ ] Show live markdown preview

### Day 2: Polish & Deploy
- [ ] Add workflow status visualization
- [ ] Create mock collection listing
- [ ] Basic CSS styling (Tailwind or similar)
- [ ] Deploy to static hosting

## What We DON'T Build

❌ **Real File System** - Use mocks only  
❌ **Document Download** - Show markdown preview instead  
❌ **Web Scraping** - Skip URL features for web demo  
❌ **User Accounts** - No persistence needed  
❌ **Complex UI** - Keep it minimal and functional  
❌ **Mobile Optimization** - Desktop-only is fine  

## Success Criteria

✅ **Demonstrates Core Concept** - Shows template system working  
✅ **Interactive** - User can input data and see results  
✅ **Fast to Build** - Leverages existing TypeScript modules  
✅ **Easy to Deploy** - Static site, no backend complexity  
✅ **Blog Post Ready** - Good screenshots and examples  

## Example User Flow

1. **Visit Demo Page**
   - See explanation: "Try the markdown-workflow system in your browser"
   - Big friendly "Start Demo" button

2. **Configuration & Templates Page**
   - **3 Big Text Areas:**
     - "Your Info (YAML)" - Pre-filled with sample user config
     - "Resume Template" - Pre-filled with working template showing mustache variables
     - "Cover Letter Template" - Pre-filled with working template
   - **Company/Role Fields:** "Google" and "Software Engineer" (editable)
   - **Live Preview:** Small preview pane showing variable substitution
   - **Generate Button:** "Create My Job Application"

3. **Generated Files Page**
   - **Success Message:** "✅ Generated collection: google_software_engineer_20241125"
   - **File List with Explanations:**
     ```
     📄 resume_john_doe.md (2.1 KB)
        → Your personalized resume with Google/Software Engineer details
     
     📄 cover_letter_john_doe.md (1.8 KB) 
        → Your customized cover letter for this specific role
     
     📄 collection.yml (0.8 KB)
        → Metadata file for tracking application status
     ```
   - **File Preview:** Click filename to see contents in expandable section
   - **Download:** Big "📦 Download ZIP" button
   - **ZIP Contents:** `google_software_engineer_20241125.zip` containing all files in properly named folder

4. **Learn More**
   - "Try the real CLI tool" with installation instructions
   - Link to blog post about building it
   - GitHub repository link

## Deployment

- **URL:** `https://markdown-workflow-demo.vercel.app` or similar
- **Source:** Add `/demo` page to existing Next.js project
- **Cost:** Free (static hosting)
- **Maintenance:** None (pure client-side)

---

**Philosophy:** This demo should take 2 days maximum and showcase the core value proposition without getting bogged down in complexity. It's a teaser that drives people to try the real CLI tool.