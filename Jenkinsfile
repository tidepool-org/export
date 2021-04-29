@Library('mdblp-library') _
pipeline {
    agent any
    stages {
        stage('Initialization') {
            steps {
                script {
                    utils.initPipeline()
                    if (env.GIT_COMMIT == null) {
                        // git commit id must be a 40 characters length string (lower case or digits)
                        env.GIT_COMMIT = "f".multiply(40)
                    }
                    env.RUN_ID = UUID.randomUUID().toString()
                }
            }
        }
        stage('Build') {
            agent {
                docker {
                    image "docker.ci.diabeloop.eu/node-build:12"
                }
            }
            steps {
                withCredentials([string(credentialsId: 'nexus-token', variable: 'NEXUS_TOKEN')]) {
                    sh "npm version"
                    sh "npm install"
                    sh "npm run build-ci"
                    stash name: "node_modules", includes: "node_modules/**"
                }
            }
        }
        stage('Package') {
            steps {
                withCredentials([string(credentialsId: 'nexus-token', variable: 'NEXUS_TOKEN')]) {
                    pack()
                }
            }
        }
        stage('Documentation') {
            steps {
                unstash "node_modules"
                genDocumentation()
                dir("output") {
                    archiveArtifacts artifacts: '*-soup.md', allowEmptyArchive: true
                    archiveArtifacts artifacts: '*-latest-swagger.json', allowEmptyArchive: true
                }
            }
        }
        stage('Publish') {
            when { branch "dblp" }
            steps {
                publish()
            }
        }
    }
}
