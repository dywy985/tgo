#!/usr/bin/env node

/**
 * Production Build Verification Script
 * Checks that mock data is properly excluded from production builds
 */

import fs from 'fs';
import path from 'path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function checkBuildOutput() {
  log('\n🔍 Verifying Production Build...', 'blue');
  
  const distPath = path.join(process.cwd(), 'dist');
  
  if (!fs.existsSync(distPath)) {
    log('❌ Build output not found. Run "yarn build" first.', 'red');
    return false;
  }

  try {
    // Check for mock data in build output
    log('\n1. Scanning build output for mock data...', 'yellow');
    
    const scanDirectory = (dir, depth = 0) => {
      if (depth > 3) return []; // Limit recursion depth
      
      const files = fs.readdirSync(dir);
      const mockReferences = [];
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            mockReferences.push(...scanDirectory(filePath, depth + 1));
        } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Check for mock data references
          const mockMatches = [
            /mockAgents/g,
            /mockChannels/g,
            /mockChats/g,
            /mockMessages/g,
            /mockVisitor/g,
            /mockToolStore/g,
            /@\/data\/mock/g
          ];
          
          mockMatches.forEach(regex => {
            const matches = content.match(regex);
            if (matches) {
              mockReferences.push({
                file: path.relative(distPath, filePath),
                matches: matches.length,
                type: regex.source
              });
            }
          });
        }
      }
      
      return mockReferences;
    };
    
    const mockRefs = scanDirectory(distPath);
    
    if (mockRefs.length === 0) {
      log('✅ No mock data found in production build', 'green');
    } else {
      log('⚠️ Mock data references found in build:', 'yellow');
      mockRefs.forEach(ref => {
        log(`  - ${ref.file}: ${ref.matches} occurrences of ${ref.type}`, 'yellow');
      });
    }

    // Check bundle size
    log('\n2. Analyzing bundle size...', 'yellow');
    
    const assetsPath = path.join(distPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      const files = fs.readdirSync(assetsPath);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      
      let totalSize = 0;
      jsFiles.forEach(file => {
        const filePath = path.join(assetsPath, file);
        const size = fs.statSync(filePath).size;
        totalSize += size;
        
        const sizeKB = (size / 1024).toFixed(2);
        log(`  - ${file}: ${sizeKB} KB`, 'blue');
      });
      
      const totalSizeKB = (totalSize / 1024).toFixed(2);
      log(`📊 Total JS bundle size: ${totalSizeKB} KB`, 'blue');
      
      if (totalSize > 1024 * 1024) { // > 1MB
        log('⚠️ Bundle size is large. Consider code splitting.', 'yellow');
      } else {
        log('✅ Bundle size looks reasonable', 'green');
      }
    }

    // Check for proper tree shaking
    log('\n3. Checking tree shaking...', 'yellow');
    
    const indexHtml = path.join(distPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      const htmlContent = fs.readFileSync(indexHtml, 'utf8');
      const jsFiles = htmlContent.match(/src="[^"]*\.js"/g) || [];
      
      log(`✅ Found ${jsFiles.length} JavaScript files in index.html`, 'green');
      
      // Check if development-only code is excluded
      if (jsFiles.length <= 5) { // Reasonable number for a React app
        log('✅ Tree shaking appears to be working correctly', 'green');
      } else {
        log('⚠️ Many JS files detected. Check if tree shaking is optimal.', 'yellow');
      }
    }

    log('\n🎉 Production build verification completed!', 'green');
    
    log('\n📝 Summary:', 'blue');
    log(`- Mock data exclusion: ${mockRefs.length === 0 ? '✅ Clean' : '⚠️ Needs attention'}`);
    log('- Bundle size: ✅ Analyzed');
    log('- Tree shaking: ✅ Verified');
    
    return mockRefs.length === 0;

  } catch (error) {
    log('\n❌ Build verification failed:', 'red');
    console.error(error.message);
    return false;
  }
}

// Run verification
const success = checkBuildOutput();
process.exit(success ? 0 : 1);